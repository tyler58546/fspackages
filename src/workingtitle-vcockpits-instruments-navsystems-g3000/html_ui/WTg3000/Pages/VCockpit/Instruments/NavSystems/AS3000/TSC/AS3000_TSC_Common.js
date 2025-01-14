class AS3000_TSC_NavButton_Data {
    constructor() {
        this.isActive = false;
    }
}
class AS3000_TSC_NavButton {
    constructor(_id, _gps) {
        this.noData = new AS3000_TSC_NavButton_Data();
        this.gps = _gps;
        this.button = this.gps.getChildById(_id);
        if (this.button) {
            this.text = this.button.getElementsByClassName("label")[0];
            this.img = this.button.getElementsByClassName("img")[0];
        }
        this.currentState = this.noData;
        this.savedData = this.noData;
        this.gps.makeButton(this.button, this.onClick.bind(this));
    }
    setState(_data, _fromPopUp = false) {
        if (!_fromPopUp) {
            this.savedData = _data;
        }
        if (_data.isActive) {
            this.currentState = _data;
            this.text.innerHTML = _data.title;
            this.img.setAttribute("src", _data.imagePath);
            this.button.setAttribute("state", "");
        }
        else {
            this.button.setAttribute("state", "Inactive");
        }
    }
    deactivate(_fromPopUp = false) {
        if (_fromPopUp) {
            this.setState(this.savedData);
        }
        else {
            this.setState(this.noData);
        }
    }
    onClick() {
        if (this.currentState && this.currentState.callback) {
            this.currentState.callback();
        }
    }
}

class AS3000_TSC extends NavSystemTouch {
    constructor() {
        super();

        this.speedBugs = this.createSpeedBugsPage();
        this.pfdPrefix = "AS3000_PFD_1";
        this._isChangingPages = false;
        this.history = [];
        this.initDuration = 4000;

        this._icaoWaypointFactory = new WT_ICAOWaypointFactory();
        this._icaoSearchers = {
            airport: new WT_ICAOSearcher(this, WT_ICAOSearcher.Keys.AIRPORT),
            vor: new WT_ICAOSearcher(this, WT_ICAOSearcher.Keys.VOR),
            ndb: new WT_ICAOSearcher(this, WT_ICAOSearcher.Keys.NDB),
            int: new WT_ICAOSearcher(this, WT_ICAOSearcher.Keys.INT)
        };

        this._mfdMainPaneSettings = {controller: new WT_DataStoreController("MFD", null)};
        this._mfdMainPaneSettings.controller.addSetting(this._mfdMainPaneSettings.mode = new WT_G3x5_MFDMainPaneModeSetting(this._mfdMainPaneSettings.controller));
        this._mfdMainPaneSettings.mode.addListener(this._onMFDMainPaneModeChanged.bind(this));

        this._mfdLeftPaneSettings = {controller: new WT_DataStoreController(`MFD-${WT_G3x5_MFDHalfPane.ID.LEFT}`, null)};
        this._mfdRightPaneSettings = {controller: new WT_DataStoreController(`MFD-${WT_G3x5_MFDHalfPane.ID.RIGHT}`, null)};
        this._initHalfPaneController(this._mfdLeftPaneSettings);
        this._initHalfPaneController(this._mfdRightPaneSettings);

        this._mfdLeftPaneSettings.display.addListener(this._onMFDHalfPaneDisplayChanged.bind(this));
        this._mfdRightPaneSettings.display.addListener(this._onMFDHalfPaneDisplayChanged.bind(this));

        this._mfdMainPaneSettings.controller.update();

        this._initLightingControl();

        this._selectedMfdPane = WT_G3x5_MFDHalfPane.ID.LEFT;
        this._mfdPaneControlID;
    }

    _initHalfPaneController(paneSettings) {
        paneSettings.controller.addSetting(paneSettings.control = new WT_G3x5_MFDHalfPaneControlSetting(paneSettings.controller));
        paneSettings.controller.addSetting(paneSettings.display = new WT_G3x5_MFDHalfPaneDisplaySetting(paneSettings.controller));
        paneSettings.controller.addSetting(paneSettings.waypoint = new WT_G3x5_MFDHalfPaneWaypointSetting(paneSettings.controller));
        paneSettings.controller.update();
    }

    _initLightingControl() {
        if (this.isLightingControlAllowed()) {
            SimVar.SetSimVarValue("L:XMLVAR_AS3000_DisplayLightingBool", "bool", true); // tell xmls to use custom display lighting xmlvar
            SimVar.SetSimVarValue("L:XMLVAR_AS3000_DisplayLighting", "number", WTDataStore.get(AS3000_TSC_LightingConfig.VARNAME_DISPLAY_LIGHTING, 1)); // initialize display brightness variable: 1.0 = maximum brightness
        }
    }

    /**
     * @readonly
     * @property {WT_ICAOWaypointFactory} icaoWaypointFactory
     * @type {WT_ICAOWaypointFactory}
     */
    get icaoWaypointFactory() {
        return this._icaoWaypointFactory;
    }

    /**
     * @readonly
     * @property {{airport:WT_ICAOSearcher, vor:WT_ICAOSearcher, ndb:WT_ICAOSearcher, int:WT_ICAOSearcher}} icaoSearchers
     * @type {{airport:WT_ICAOSearcher, vor:WT_ICAOSearcher, ndb:WT_ICAOSearcher, int:WT_ICAOSearcher}}
     */
    get icaoSearchers() {
        return this._icaoSearchers;
    }

    get mfdPaneControlID() {
        return this._mfdPaneControlID;
    }

    get mfdMainPaneSettings() {
        return this._mfdMainPaneSettings;
    }

    get mfdLeftPaneSettings() {
        return this._mfdLeftPaneSettings;
    }

    get mfdRightPaneSettings() {
        return this._mfdRightPaneSettings;
    }

    getSelectedMFDPane() {
        if (this.mfdMainPaneSettings.mode.getValue() === WT_G3x5_MFDMainPaneModeSetting.Mode.FULL) {
            return WT_G3x5_MFDHalfPane.ID.LEFT;
        } else {
            return this._selectedMfdPane;
        }
    }

    getSelectedMFDPaneSettings() {
        return this.getSelectedMFDPane() === WT_G3x5_MFDHalfPane.ID.LEFT ? this._mfdLeftPaneSettings : this._mfdRightPaneSettings;
    }

    isLightingControlAllowed() {
        return AS3000_TSC.LIGHTING_CONTROL_ALLOWED_AIRCRAFT.has(SimVar.GetSimVarValue("ATC MODEL", "string"));
    }

    createSpeedBugsPage() {
        return new AS3000_TSC_SpeedBugs();
    }

    get templateID() { return "AS3000_TSC"; }

    _initMFDPaneControlID() {
        this._mfdPaneControlID = this.urlConfig.index === 1 ? WT_G3x5_MFDHalfPaneControlSetting.Touchscreen.LEFT : WT_G3x5_MFDHalfPaneControlSetting.Touchscreen.RIGHT;
    }

    _initMFDPaneSelectDisplay() {
        this._mfdPaneSelectDisplay = this.getChildById("Softkey_1_Container").querySelector(`tsc-mfdpaneselectdisplay`);
        this._mfdPaneSelectDisplay.selectColor = this.urlConfig.index === 1 ? WT_G3x5_MFDMainPane.LEFT_TSC_COLOR : WT_G3x5_MFDMainPane.RIGHT_TSC_COLOR;
    }

    connectedCallback() {
        super.connectedCallback();
        this.pagesContainer = this.getChildById("PagesDisplay");
        this.pageTitle = this.getChildById("PageTitle");
        this.pfdSoftkey = this.getChildById("SoftKey_2");
        this.mfdSoftkey = this.getChildById("SoftKey_3");
        this.navcomSoftkey = this.getChildById("SoftKey_4");

        this._mfdPagesLeft = {};
        this._mfdPagesRight = {};

        this.pageGroups = [
            new NavSystemPageGroup("PFD", this, [
                new NavSystemPage("PFD Home", "PFDHome", new AS3000_TSC_PFDHome()),
                new NavSystemPage("Speed Bugs", "SpeedBugs", this.speedBugs),
                new NavSystemPage("Timers", "Timers", new WT_G3x5_TSCTimer("PFD Home", "PFD", "Generic")),
                new NavSystemPage("Minimums", "Minimums", new AS3000_TSC_Minimums()),
                this._pfdMapSettings = new NavSystemPage("PFD Map Settings", "PFDMapSettings", new WT_G3x5_TSCPFDMapSettings("PFD", "PFD Home", "PFD")),
                new NavSystemPage("PFD Settings", "PFDSettings", new WT_G3000_TSCPFDSettings("PFD", "PFD Home", "PFD")),
            ]),
            new NavSystemPageGroup("MFD", this, [
                this._mfdHome = new NavSystemPage("MFD Home", "MFDHome", new AS3000_TSC_MFDHome()),
                this._mfdMapSettingsPage = new NavSystemPage("Map Settings", "MFDMapSettings", new WT_G3x5_TSCMFDMapSettings("MFD", "MFD Home", "MFD")),
                this._mfdPagesLeft.mapPointerControl = new NavSystemPage("Map Pointer Control Left", "MapPointerControlLeft", new WT_G3x5_TSCMapPointerControl("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.LEFT)),
                this._mfdPagesRight.mapPointerControl = new NavSystemPage("Map Pointer Control Right", "MapPointerControlRight", new WT_G3x5_TSCMapPointerControl("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.RIGHT)),
                this._mfdPagesLeft.weatherSelection = new NavSystemPage("Weather Selection Left", "WeatherSelectionLeft", new WT_G3x5_TSCWeatherSelection("MFD", "MFD Home", "Weather Radar Settings Left")),
                this._mfdPagesRight.weatherSelection = new NavSystemPage("Weather Selection Right", "WeatherSelectionRight", new WT_G3x5_TSCWeatherSelection("MFD", "MFD Home", "Weather Radar Settings Right")),
                this._mfdPagesLeft.weatherRadar = new NavSystemPage("Weather Radar Settings Left", "WeatherRadarSettingsLeft", new WT_G3x5_TSCWeatherRadarSettings("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.LEFT)),
                this._mfdPagesRight.weatherRadar = new NavSystemPage("Weather Radar Settings Right", "WeatherRadarSettingsRight", new WT_G3x5_TSCWeatherRadarSettings("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.RIGHT)),
                new NavSystemPage("Direct To", "DirectTo", new AS3000_TSC_DirectTo()),
                new NavSystemPage("Active Flight Plan", "ActiveFlightPlan", new AS3000_TSC_ActiveFPL()),
                new NavSystemPage("Procedures", "Procedures", new AS3000_TSC_Procedures()),
                new NavSystemPage("Departure Selection", "DepartureSelection", new AS3000_TSC_DepartureSelection()),
                new NavSystemPage("Arrival Selection", "ArrivalSelection", new AS3000_TSC_ArrivalSelection()),
                new NavSystemPage("Approach Selection", "ApproachSelection", new AS3000_TSC_ApproachSelection()),
                new NavSystemPage("Waypoint Info", "WaypointsInfo", new AS3000_TSC_WaypointInfo()),
                this._mfdPagesLeft.airportInfo = new NavSystemPage("Airport Info Left", "AirportInfoLeft", new WT_G3x5_TSCAirportInfoPage("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.LEFT, this.mfdLeftPaneSettings.display, this.mfdLeftPaneSettings.waypoint, this.icaoWaypointFactory)),
                this._mfdPagesRight.airportInfo = new NavSystemPage("Airport Info Right", "AirportInfoRight", new WT_G3x5_TSCAirportInfoPage("MFD", "MFD Home", "MFD", WT_G3x5_MFDHalfPane.ID.RIGHT, this.mfdRightPaneSettings.display, this.mfdRightPaneSettings.waypoint, this.icaoWaypointFactory)),
                new NavSystemPage("Nearest", "Nearest", new AS3000_TSC_NRST()),
                new NavSystemPage("Nearest Airport", "NearestAirport", new AS3000_TSC_NRST_Airport()),
                new NavSystemPage("Nearest Intersection", "NearestIntersection", new AS3000_TSC_NRST_Intersection()),
                new NavSystemPage("Nearest VOR", "NearestVOR", new AS3000_TSC_NRST_VOR()),
                new NavSystemPage("Nearest NDB", "NearestNDB", new AS3000_TSC_NRST_NDB()),
                new NavSystemPage("Speed Bugs", "SpeedBugs", this.speedBugs),
                new NavSystemPage("Aircraft Systems", "AircraftSystems", new AS3000_TSC_AircraftSystems()),
                new NavSystemPage("Lighting Configuration", "LightingConfig", new AS3000_TSC_LightingConfig()),
                new NavSystemPage("Utilities", "Utilities", new AS3000_TSC_Utilities()),
                new NavSystemPage("Setup", "UtilitiesSetup", new AS3000_TSC_UtilitiesSetup()),
                new NavSystemPage("Avionics Settings", "AvionicsSettings", new WT_G3x5_TSCAvionicsSettings("MFD", "MFD Home", "MFD"))
            ]),
            new NavSystemPageGroup("NavCom", this, [
                new NavSystemPage("NAV/COM Home", "NavComHome", new AS3000_TSC_NavComHome()),
            ]),
        ];
        this.navButtons = [
            new AS3000_TSC_NavButton("NavBar_1", this),
            new AS3000_TSC_NavButton("NavBar_2", this),
            new AS3000_TSC_NavButton("NavBar_3", this),
            new AS3000_TSC_NavButton("NavBar_4", this),
            new AS3000_TSC_NavButton("NavBar_5", this),
            new AS3000_TSC_NavButton("NavBar_6", this)
        ];
        this.transponderWindow = new NavSystemElementContainer("Transponder", "TransponderWindow", new AS3000_TSC_Transponder());
        this.transponderWindow.setGPS(this);
        this.audioRadioWindow = new NavSystemElementContainer("Audio & Radios", "AudioRadiosWindow", new AS3000_TSC_AudioRadios());
        this.audioRadioWindow.setGPS(this);
        this.frequencyKeyboard = new NavSystemElementContainer("Frequency Keyboard", "frequencyKeyboard", new AS3000_TSC_FrequencyKeyboard());
        this.frequencyKeyboard.setGPS(this);
        this.timeKeyboard = new NavSystemElementContainer("Time Keyboard", "timeKeyboard", new AS3000_TSC_TimeKeyboard());
        this.timeKeyboard.setGPS(this);
        this.speedKeyboard = new NavSystemElementContainer("Speed Keyboard", "speedKeyboard", new AS3000_TSC_SpeedKeyboard());
        this.speedKeyboard.setGPS(this);
        this.fullKeyboard = new NavSystemElementContainer("Keyboard", "fullKeyboard", new AS3000_TSC_FullKeyboard());
        this.fullKeyboard.setGPS(this);
        this.insertBeforeWaypoint = new NavSystemElementContainer("Insert Before Waypoint", "insertBeforeWaypointWindow", new AS3000_TSC_InsertBeforeWaypoint());
        this.insertBeforeWaypoint.setGPS(this);
        this.minimumSource = new NavSystemElementContainer("Minimums Source", "minimumSource", new AS3000_TSC_MinimumSource());
        this.minimumSource.setGPS(this);
        this.duplicateWaypointSelection = new NavSystemElementContainer("Waypoint Duplicates", "WaypointDuplicateWindow", new AS3000_TSC_DuplicateWaypointSelection());
        this.duplicateWaypointSelection.setGPS(this);
        this.loadFrequencyWindow = new NavSystemElementContainer("Frequency Window", "LoadFrequencyPopup", new WT_G3x5_TSCLoadFrequency());
        this.loadFrequencyWindow.setGPS(this);
        this.waypointOptions = new NavSystemElementContainer("Waypoint Options", "WaypointInfo_WaypointOptions", new WT_G3x5_TSCWaypointOptions());
        this.waypointOptions.setGPS(this);
        this.confirmationWindow = new AS3000_TSC_ConfirmationWindow();
        this.terrainAlerts = new AS3000_TSC_TerrainAlert();
        this.addIndependentElementContainer(new NavSystemElementContainer("Terrain Alert", "terrainAlert", this.terrainAlerts));
        this.addIndependentElementContainer(new NavSystemElementContainer("Confirmation Window", "ConfirmationWindow", this.confirmationWindow));

        this.selectionListWindow1 = new NavSystemElementContainer("Dynamic Selection List Window 1", "DynamicSelectionListWindow1", new WT_G3x5_TSCSelectionListWindow());
        this.selectionListWindow1.setGPS(this);
        this.selectionListWindow2 = new NavSystemElementContainer("Dynamic Selection List Window 2", "DynamicSelectionListWindow2", new WT_G3x5_TSCSelectionListWindow());
        this.selectionListWindow2.setGPS(this);

        this.mapDetailSelect = new NavSystemElementContainer("Map Detail Settings", "MapDetailSelect", new WT_G3x5_TSCMapDetailSelect());
        this.mapDetailSelect.setGPS(this);

        this._initMFDPaneControlID();
        this._initMFDPaneSelectDisplay();
    }

    getSelectedMFDPanePages() {
        return this.getSelectedMFDPane() === WT_G3x5_MFDHalfPane.ID.LEFT ? this._mfdPagesLeft : this._mfdPagesRight;
    }

    parseXMLConfig() {
        super.parseXMLConfig();
        let pfdPrefix_elem = this.xmlConfig.getElementsByTagName("PFD");
        if (pfdPrefix_elem.length > 0) {
            this.pfdPrefix = pfdPrefix_elem[0].textContent;
        }
    }
    disconnectedCallback() {
        super.disconnectedCallback();
    }
    reboot() {
        super.reboot();
        if (this.terrainAlerts)
            this.terrainAlerts.reset();
    }

    _updatePageTitle() {
        let currentPage = this.getCurrentPage();
        let title = currentPage.title ? currentPage.title : currentPage.name;
        if (this.pageTitle.innerHTML != title) {
            this.pageTitle.innerHTML = title;
        }
    }

    _updateMFDPaneSelectDisplay() {
        if (this.getCurrentPageGroup().name === "MFD" && this.getCurrentPage().title !== "Map Pointer Control") {
            if (this._mfdPaneSelectDisplay.style.display !== "block") {
                this._mfdPaneSelectDisplay.style.display = "block";
            }
            this._mfdPaneSelectDisplay.setPaneMode(this._mfdMainPaneSettings.mode.getValue());
            this._mfdPaneSelectDisplay.setSelected(this.getSelectedMFDPane());
        } else if (this._mfdPaneSelectDisplay.style.display !== "none") {
            this._mfdPaneSelectDisplay.style.display = "none";
        }
    }

    _updateSoftkeyLabels() {
        switch (this.getCurrentPageGroup().name) {
            case "PFD":
                Avionics.Utils.diffAndSetAttribute(this.pfdSoftkey, "state", "Selected");
                Avionics.Utils.diffAndSetAttribute(this.mfdSoftkey, "state", "");
                Avionics.Utils.diffAndSetAttribute(this.navcomSoftkey, "state", "");
                break;
            case "MFD":
                Avionics.Utils.diffAndSetAttribute(this.pfdSoftkey, "state", "");
                Avionics.Utils.diffAndSetAttribute(this.mfdSoftkey, "state", "Selected");
                Avionics.Utils.diffAndSetAttribute(this.navcomSoftkey, "state", "");
                break;
            case "NavCom":
                Avionics.Utils.diffAndSetAttribute(this.pfdSoftkey, "state", "");
                Avionics.Utils.diffAndSetAttribute(this.mfdSoftkey, "state", "");
                Avionics.Utils.diffAndSetAttribute(this.navcomSoftkey, "state", "Selected");
                break;
        }
    }

    onUpdate() {
        this.icaoWaypointFactory.update();

        this._updatePageTitle();
        this._updateSoftkeyLabels();
        this._updateMFDPaneSelectDisplay();
    }

    _onMFDMainPaneModeChanged(setting, newValue, oldValue) {
        if (newValue === WT_G3x5_MFDMainPaneModeSetting.Mode.FULL) {
            this._setSelectedMFDHalfPane(WT_G3x5_MFDHalfPane.ID.LEFT);
        } else {
            let defaultControl = this._mfdPaneControlID === WT_G3x5_MFDHalfPaneControlSetting.Touchscreen.LEFT ? WT_G3x5_MFDHalfPane.ID.LEFT : WT_G3x5_MFDHalfPane.ID.RIGHT;
            this._setSelectedMFDHalfPane(defaultControl);
        }
    }

    _onMFDPaneNavMapDisplaySwitch(currentPageGroup, currentPage) {
        if (currentPageGroup.name === "MFD" && currentPage.name === "Map Settings" && currentPage.title === "Map Pointer Control") {
            this.closePopUpElement();
            this.SwitchToPageName("MFD", "MFD Home");
        }
    }

    _onMFDPaneWeatherDisplaySwitch(currentPageGroup, currentPage) {
        if (currentPageGroup.name === "MFD" && currentPage.title === "Weather Selection" && currentPage.title === "Weather Radar Settings") {
            this.closePopUpElement();
            this.SwitchToPageName("MFD", "MFD Home");
        }
    }

    _onMFDHalfPaneDisplayChanged(setting, newValue, oldValue) {
        if (!this._isChangingPages && setting === this.getSelectedMFDPaneSettings().display) {
            let currentPageGroup = this.getCurrentPageGroup();
            let currentPage = this.getCurrentPage();
            switch (oldValue) {
                case WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP:
                    this._onMFDPaneNavMapDisplaySwitch(currentPageGroup, currentPage);
                    break;
                case WT_G3x5_MFDHalfPaneDisplaySetting.Display.WEATHER:
                    this._onMFDPaneWeatherDisplaySwitch(currentPageGroup, currentPage);
                    break;
            }
        }
    }

    _handleNavigationEvent(event) {
        switch (event) {
            case "SoftKey_1":
                this.SwitchToPageName("PFD", "PFD Home");
                this.closePopUpElement();
                this.history = [];
                break;
            case "SoftKey_2":
                this.SwitchToPageName("MFD", "MFD Home");
                this.closePopUpElement();
                this.history = [];
                break;
            case "SoftKey_3":
                this.SwitchToMenuName("NavCom");
                this.closePopUpElement();
                this.history = [];
                break;
        }
    }

    _changeMFDMapRange(delta) {
        let controllerID = `MFD-${this.getSelectedMFDPane()}`;
        let currentIndex = WT_MapController.getSettingValue(controllerID, WT_MapRangeSetting.KEY_DEFAULT);
        let newIndex = Math.max(Math.min(currentIndex + delta, WT_G3x5_NavMap.MAP_RANGE_LEVELS.length - 1), 0);
        WT_MapController.setSettingValue(controllerID, WT_MapRangeSetting.KEY_DEFAULT, newIndex, true);
    }

    _changePFDMapRange(delta) {
        let controllerID = "PFD";
        let currentIndex = WT_MapController.getSettingValue(controllerID, WT_MapRangeSetting.KEY_DEFAULT);
        let newIndex = Math.max(Math.min(currentIndex + delta, WT_G3x5_NavMap.MAP_RANGE_LEVELS.length - 1), 0);
        WT_MapController.setSettingValue(controllerID, WT_MapRangeSetting.KEY_DEFAULT, newIndex, true);
    }

    _handleZoomEventPFD(event) {
        if (!this._pfdMapSettings.element.insetMapShowSetting.getValue()) {
            return;
        }

        switch (event) {
            case "BottomKnob_Small_INC":
                this._changePFDMapRange(1);
                break;
            case "BottomKnob_Small_DEC":
                this._changePFDMapRange(-1);
                break;
        }
    }

    _handleZoomEventMFD(event) {
        switch (this.getSelectedMFDPaneSettings().display.getValue()) {
            case WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP:
                switch (event) {
                    case "BottomKnob_Small_INC":
                        this._changeMFDMapRange(1);
                        break;
                    case "BottomKnob_Small_DEC":
                        this._changeMFDMapRange(-1);
                        break;
                }
                break;
            case WT_G3x5_MFDHalfPaneDisplaySetting.Display.WEATHER:
                switch (event) {
                    case "BottomKnob_Small_INC":
                        this.getSelectedMFDPanePages().weatherRadar.element.changeRange(1);
                        break;
                    case "BottomKnob_Small_DEC":
                        this.getSelectedMFDPanePages().weatherRadar.element.changeRange(-1);
                        break;
                }
                break;
        }
    }

    _handleZoomEvent(event) {
        if (this.getCurrentPageGroup().name === "PFD") {
            this._handleZoomEventPFD(event);
        } else if (this.getCurrentPageGroup().name === "MFD") {
            this._handleZoomEventMFD(event);
        }
    }

    _setSelectedMFDHalfPane(value) {
        if (this._selectedMfdPane === value || this._mfdPaneControlID === undefined) {
            return;
        }

        this._selectedMfdPane = value;
        switch (this._selectedMfdPane) {
            case WT_G3x5_MFDHalfPane.ID.LEFT:
                this.mfdRightPaneSettings.control.removeControl(this._mfdPaneControlID);
                this.mfdLeftPaneSettings.control.addControl(this._mfdPaneControlID);
                break;
            case WT_G3x5_MFDHalfPane.ID.RIGHT:
                this.mfdLeftPaneSettings.control.removeControl(this._mfdPaneControlID);
                this.mfdRightPaneSettings.control.addControl(this._mfdPaneControlID);
                break;
        }
        if (this.getCurrentPageGroup().name === "MFD") {
            this.closePopUpElement();
            this.SwitchToPageName("MFD", "MFD Home");
        }
    }

    _switchMFDHalfPaneControl() {
        switch (this._selectedMfdPane) {
            case WT_G3x5_MFDHalfPane.ID.LEFT:
                this._setSelectedMFDHalfPane(WT_G3x5_MFDHalfPane.ID.RIGHT);
                break;
            case WT_G3x5_MFDHalfPane.ID.RIGHT:
                this._setSelectedMFDHalfPane(WT_G3x5_MFDHalfPane.ID.LEFT);
                break;
        }
    }

    _handleControlEvent(event) {
        if (this.getCurrentPageGroup().name === "MFD" && this.mfdMainPaneSettings.mode.getValue() === WT_G3x5_MFDMainPaneModeSetting.Mode.HALF && this.getCurrentPage().title !== "Map Pointer Control") {
            switch (event) {
                case "TopKnob_Small_INC":
                case "TopKnob_Small_DEC":
                    this._switchMFDHalfPaneControl();
                    break;
            }
        }
    }

    _handleMapPointerEvent(event) {
        if (event === "BottomKnob_Push" && this.getCurrentPageGroup().name === "MFD" && this.getSelectedMFDPaneSettings().display.getValue() === WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP) {
            this.closePopUpElement();
            this.SwitchToPageName("MFD", this.getSelectedMFDPanePages().mapPointerControl.name);
        }
    }

    onEvent(event) {
        super.onEvent(event);

        this._handleNavigationEvent(event);
        this._handleZoomEvent(event);
        this._handleControlEvent(event);
        this._handleMapPointerEvent(event);
    }

    goBack() {
        let last = this.history.pop();
        this.closePopUpElement();
        if (last.popUpPage) {
            this.switchToPopUpPage(last.popUpPage);
        } else {
            this.SwitchToPageName(last.menuName, last.pageName);
        }
        this.history.pop();
    }
    getFullKeyboard() {
        return this.fullKeyboard;
    }
    activateNavButton(_id, _title, _callback, _fromPopUp = false, _imagePath = "defaultImage.png") {
        let data = new AS3000_TSC_NavButton_Data();
        data.title = _title;
        data.callback = _callback;
        data.imagePath = "/WTg3000/SDK/Assets/Images/TSC/" + _imagePath;
        data.isActive = true;
        this.navButtons[_id - 1].setState(data, _fromPopUp);
    }
    deactivateNavButton(_id, _fromPopUp = false) {
        this.navButtons[_id - 1].deactivate(_fromPopUp);
    }
    setTopKnobText(_text, _fromPopUp = false) {
        if (!_fromPopUp) {
            this.topKnobText_Save = _text;
        }
        if (this.topKnobText.innerHTML != _text) {
            this.topKnobText.innerHTML = _text;
        }
    }
    setBottomKnobText(_text, _fromPopUp = false) {
        if (!_fromPopUp) {
            this.bottomKnobText_Save = _text;
        }
        if (this.bottomKnobText.innerHTML != _text) {
            this.bottomKnobText.innerHTML = _text;
        }
    }
    rollBackKnobTexts() {
        this.topKnobText.innerHTML = this.topKnobText_Save;
        this.bottomKnobText.innerHTML = this.bottomKnobText_Save;
    }
    closePopUpElement() {
        super.closePopUpElement();
        this.rollBackKnobTexts();
    }
    SwitchToPageName(_menu, _page) {
        this._isChangingPages = true;
        let historyPoint = new AS3000_TSC_PageInfos();
        if (!this.popUpElement) {
            historyPoint.menuName = this.getCurrentPageGroup().name;
            historyPoint.pageName = this.getCurrentPage().name;
        }
        this.history.push(historyPoint);
        super.SwitchToPageName(_menu, _page);
        this._isChangingPages = false;
    }
    switchToPopUpPage(_pageContainer) {
        this._isChangingPages = true;
        let historyPoint = new AS3000_TSC_PageInfos();
        historyPoint.popUpPage = this.popUpElement;
        historyPoint.menuName = this.getCurrentPageGroup().name;
        historyPoint.pageName = this.getCurrentPage().name;
        this.history.push(historyPoint);
        super.switchToPopUpPage(_pageContainer);
        this._isChangingPages = false;
    }
    openConfirmationWindow(_text, _button) {
        this.confirmationWindow.open(_text, _button);
    }
}
AS3000_TSC.LIGHTING_CONTROL_ALLOWED_AIRCRAFT = new Set([
    "TT:ATCCOM.AC_MODEL_TBM9.0.text"
]);

class AS3000_TSC_PageInfos {
}
class AS3000_TSC_PFDHome extends NavSystemElement {
    init(root) {
        this.NavSourceButton = this.gps.getChildById("NavSourceButton");
        this.NavSourceButton_Value = this.NavSourceButton.getElementsByClassName("lowerValue")[0];
        this.OBSButton = this.gps.getChildById("OBSButton");
        this.CASUpButton = this.gps.getChildById("CASUpButton");
        this.Bearing1Button = this.gps.getChildById("Bearing1Button");
        this.Bearing1Button_Value = this.Bearing1Button.getElementsByClassName("lowerValue")[0];
        this.Bearing2Button = this.gps.getChildById("Bearing2Button");
        this.Bearing2Button_Value = this.Bearing2Button.getElementsByClassName("lowerValue")[0];
        this.CASDownButton = this.gps.getChildById("CASDownButton");
        this.SpeedBugsButton = this.gps.getChildById("SpeedBugsButton_PFD");
        this.TimersButton = this.gps.getChildById("TimersButton");
        this.MinimumsButton = this.gps.getChildById("MinimumsButton");
        this.TrafficMapButton = this.gps.getChildById("TrafficMapButton");
        this.PFDMapSettingsButton = this.gps.getChildById("PFDMapSettingsButton");
        this.SensorsButton = this.gps.getChildById("SensorsButton");
        this.PFDSettingsButton = this.gps.getChildById("PFDSettingsButton");
        this.gps.makeButton(this.NavSourceButton, this.sendMouseEvent.bind(this.gps, this.gps.pfdPrefix + "_NavSourceSwitch"));
        this.gps.makeButton(this.Bearing1Button, this.sendMouseEvent.bind(this.gps, this.gps.pfdPrefix + "_BRG1Switch"));
        this.gps.makeButton(this.Bearing2Button, this.sendMouseEvent.bind(this.gps, this.gps.pfdPrefix + "_BRG2Switch"));
        this.gps.makeButton(this.SpeedBugsButton, this.gps.SwitchToPageName.bind(this.gps, "PFD", "Speed Bugs"));
        this.gps.makeButton(this.TimersButton, this.gps.SwitchToPageName.bind(this.gps, "PFD", "Timers"));
        this.gps.makeButton(this.MinimumsButton, this.gps.SwitchToPageName.bind(this.gps, "PFD", "Minimums"));
        this.gps.makeButton(this.PFDMapSettingsButton, this.gps.SwitchToPageName.bind(this.gps, "PFD", "PFD Map Settings"));
        this.gps.makeButton(this.PFDSettingsButton, this.gps.SwitchToPageName.bind(this.gps, "PFD", "PFD Settings"));
    }
    onEnter() {
        this.gps.setTopKnobText("");
        this.gps.setBottomKnobText("-Range+");
    }
    onUpdate(_deltaTime) {
        if (SimVar.GetSimVarValue("GPS DRIVES NAV1", "Boolean")) {
            Avionics.Utils.diffAndSet(this.NavSourceButton_Value, "FMS");
        }
        else {
            if (SimVar.GetSimVarValue("AUTOPILOT NAV SELECTED", "number") == 1) {
                Avionics.Utils.diffAndSet(this.NavSourceButton_Value, "NAV1");
            }
            else {
                Avionics.Utils.diffAndSet(this.NavSourceButton_Value, "NAV2");
            }
        }
        let brg1Src = SimVar.GetSimVarValue("L:PFD_BRG1_Source", "number");
        switch (brg1Src) {
            case 0:
                Avionics.Utils.diffAndSet(this.Bearing1Button_Value, "OFF");
                break;
            case 1:
                Avionics.Utils.diffAndSet(this.Bearing1Button_Value, "NAV1");
                break;
            case 2:
                Avionics.Utils.diffAndSet(this.Bearing1Button_Value, "NAV2");
                break;
            case 3:
                Avionics.Utils.diffAndSet(this.Bearing1Button_Value, "GPS");
                break;
            case 4:
                Avionics.Utils.diffAndSet(this.Bearing1Button_Value, "ADF");
                break;
        }
        let brg2Src = SimVar.GetSimVarValue("L:PFD_BRG2_Source", "number");
        switch (brg2Src) {
            case 0:
                Avionics.Utils.diffAndSet(this.Bearing2Button_Value, "OFF");
                break;
            case 1:
                Avionics.Utils.diffAndSet(this.Bearing2Button_Value, "NAV1");
                break;
            case 2:
                Avionics.Utils.diffAndSet(this.Bearing2Button_Value, "NAV2");
                break;
            case 3:
                Avionics.Utils.diffAndSet(this.Bearing2Button_Value, "GPS");
                break;
            case 4:
                Avionics.Utils.diffAndSet(this.Bearing2Button_Value, "ADF");
                break;
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
    sendMouseEvent(_event) {
        LaunchFlowEvent("ON_MOUSERECT_HTMLEVENT", _event);
    }
}
class AS3000_TSC_MFDHome extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.lastMode = 0;
    }

    init(root) {
        this._mapButton = this.gps.getChildById("MapButton");
        this._mapButtonTitle = this._mapButton.getElementsByClassName("label")[0];
        this._weatherButton = this.gps.getChildById("WeatherButton");
        this._weatherButtonTitle = this._weatherButton.getElementsByClassName("label")[0];
        this.directToButton = this.gps.getChildById("DirectToButton");
        this.FlightPlanButton = this.gps.getChildById("FlightPlanButton");
        this.procButton = this.gps.getChildById("ProcButton");
        this.NearestButton = this.gps.getChildById("NearestButton");
        this.speedBugsButton = this.gps.getChildById("SpeedBugsButton_MFD");
        this.WaypointsInfoButton = this.gps.getChildById("WaypointInfoButton");
        this.aircraftSystemsButton = this.gps.getChildById("AircraftSystemsButton");
        this.utilitiesButton = this.gps.getChildById("UtilitiesButton");
        this.gps.makeButton(this._mapButton, this._onMapButtonPressed.bind(this));
        this.gps.makeButton(this._weatherButton, this._onWeatherButtonPressed.bind(this));
        this.gps.makeButton(this.directToButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Direct To"));
        this.gps.makeButton(this.FlightPlanButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Active Flight Plan"));
        this.gps.makeButton(this.procButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Procedures"));
        this.gps.makeButton(this.NearestButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Nearest"));
        this.gps.makeButton(this.speedBugsButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Speed Bugs"));
        this.gps.makeButton(this.WaypointsInfoButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Waypoint Info"));
        this.gps.makeButton(this.aircraftSystemsButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Aircraft Systems"));
        this.gps.makeButton(this.utilitiesButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Utilities"));

        this.gps.mfdMainPaneSettings.mode.addListener(this._onMainPaneModeChanged.bind(this));
        this.gps.mfdLeftPaneSettings.control.addListener(this._onPaneControlChanged.bind(this));
        this.gps.mfdRightPaneSettings.control.addListener(this._onPaneControlChanged.bind(this));
        this.gps.mfdLeftPaneSettings.display.addListener(this._onPaneDisplayChanged.bind(this));
        this.gps.mfdRightPaneSettings.display.addListener(this._onPaneDisplayChanged.bind(this));

        this._updateMapWeatherButtons();
    }

    _openWeatherSelectPage() {
        this.gps.SwitchToPageName("MFD", this.gps.getSelectedMFDPanePages().weatherSelection.name);
    }

    _openMapSettingsPage() {
        this.gps.SwitchToPageName("MFD", "Map Settings");
    }

    _onMapButtonPressed() {
        let settings = this.gps.getSelectedMFDPaneSettings();
        if (settings.display.getValue() === WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP) {
            this._openMapSettingsPage();
        } else {
            settings.display.setValue(WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP);
        }
    }

    _onWeatherButtonPressed() {
        let settings = this.gps.getSelectedMFDPaneSettings();
        if (settings.display.getValue() === WT_G3x5_MFDHalfPaneDisplaySetting.Display.WEATHER) {
            this._openWeatherSelectPage();
        } else {
            settings.display.setValue(WT_G3x5_MFDHalfPaneDisplaySetting.Display.WEATHER);
        }
    }

    _updateMapWeatherButtons() {
        let display = this.gps.getSelectedMFDPaneSettings().display.getValue();
        switch (display) {
            case WT_G3x5_MFDHalfPaneDisplaySetting.Display.NAVMAP:
                this._mapButton.setAttribute("state", "Active");
                this._mapButtonTitle.innerHTML = "Map Settings";
                this._weatherButton.setAttribute("state", "");
                this._weatherButtonTitle.innerHTML = "Weather";
                break;
            case WT_G3x5_MFDHalfPaneDisplaySetting.Display.WEATHER:
                this._weatherButton.setAttribute("state", "Active");
                this._weatherButtonTitle.innerHTML = "Weather<br>Selection";
                this._mapButton.setAttribute("state", "");
                this._mapButtonTitle.innerHTML = "Map";
                break;
            default:
                this._weatherButton.setAttribute("state", "");
                this._weatherButtonTitle.innerHTML = "Weather";
                this._mapButton.setAttribute("state", "");
                this._mapButtonTitle.innerHTML = "Map";
        }
    }

    _onPaneControlChanged(setting, newValue, oldValue) {
        if (this.gps.mfdPaneControlID !== undefined && ((newValue & this.gps.mfdPaneControlID) !== (oldValue & this.gps.mfdPaneControlID))) {
            this._updateMapWeatherButtons();
        }
    }

    _onPaneDisplayChanged(setting, newValue, oldValue) {
        if (setting === this.gps.getSelectedMFDPaneSettings().display) {
            this._updateMapWeatherButtons();
        }
    }

    _onMainPaneModeChanged(setting, newValue, oldValue) {
        if (this.gps && this.gps.getCurrentPage().name === "MFD Home") {
            this._updateNavButtons();
            this._updateMapWeatherButtons();
        }
    }

    _setMainPaneMode(mode) {
        this.gps.mfdMainPaneSettings.mode.setValue(mode);
    }

    _updateNavButtons() {
        if (this.gps.mfdMainPaneSettings.mode.getValue() === WT_G3x5_MFDMainPaneModeSetting.Mode.FULL) {
            this.gps.activateNavButton(4, "Half", this._setMainPaneMode.bind(this, WT_G3x5_MFDMainPaneModeSetting.Mode.HALF), false, "ICON_TSC_BUTTONBAR_HALF_SMALL.png");
        } else {
            this.gps.activateNavButton(4, "Full", this._setMainPaneMode.bind(this, WT_G3x5_MFDMainPaneModeSetting.Mode.FULL), false, "ICON_TSC_BUTTONBAR_FULL_SMALL.png");
        }
    }

    onEnter() {
        this.gps.setTopKnobText("");
        this.gps.setBottomKnobText("-Range+ Push: Pan");

        this._updateNavButtons();
    }

    onUpdate(_deltaTime) {
        let mapMode = SimVar.GetSimVarValue("L:AS3000_MFD_Current_Map", "number");
        if (mapMode != this.lastMode) {
            this.updateMapButtons();
            this.lastMode = mapMode;
        }
    }

    onExit() {
        this.gps.deactivateNavButton(4);
    }

    onEvent(_event) {
    }
}

class AS3000_TSC_WeatherSelection extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.lastMode = 0;
    }
    init(root) {
        this.nexradButton = this.gps.getChildById("NexradButton");
        this.wxRadarButton = this.gps.getChildById("WxRadarButton");
        this.wxRadarVertButton = this.gps.getChildById("WxRadarVertButton");
        this.nexradButton_text = this.nexradButton.getElementsByClassName("title")[0];
        this.wxRadarButton_text = this.wxRadarButton.getElementsByClassName("title")[0];
        this.wxRadarVertButton_text = this.wxRadarVertButton.getElementsByClassName("title")[0];
        this.updateWeatherMapButtons();
        this.gps.makeButton(this.nexradButton, this.weatherMapSwitch.bind(this, 0));
        if (this.gps.hasWeatherRadar()) {
            this.gps.makeButton(this.wxRadarButton, this.weatherMapSwitch.bind(this, 1));
            this.gps.makeButton(this.wxRadarVertButton, this.weatherMapSwitch.bind(this, 2));
        }
    }
    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onUpdate(_deltaTime) {
        let weatherMapMode = SimVar.GetSimVarValue("L:AS3000_MFD_Current_WeatherMap", "number");
        if (weatherMapMode != this.lastMode) {
            this.updateWeatherMapButtons();
            this.lastMode = weatherMapMode;
        }
    }
    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }
    onEvent(_event) {
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
    weatherMapSwitch(_mapIndex) {
        let currMap = SimVar.GetSimVarValue("L:AS3000_MFD_Current_WeatherMap", "number");
        if (currMap == _mapIndex) {
            switch (_mapIndex) {
                case 0:
                    break;
                case 1:
                    break;
                case 2:
                    break;
            }
        }
        else {
            SimVar.SetSimVarValue("L:AS3000_MFD_Current_WeatherMap", "number", _mapIndex);
        }
        this.updateWeatherMapButtons(_mapIndex);
    }
    updateWeatherMapButtons(_newIndex = undefined) {
        let currMap = _newIndex == undefined ? SimVar.GetSimVarValue("L:AS3000_MFD_Current_WeatherMap", "number") : _newIndex;
        if (currMap == 0) {
            Avionics.Utils.diffAndSet(this.nexradButton_text, "NEXRAD Settings");
            Avionics.Utils.diffAndSetAttribute(this.nexradButton, "state", "Active");
        }
        else {
            Avionics.Utils.diffAndSet(this.nexradButton_text, "NEXRAD");
            Avionics.Utils.diffAndSetAttribute(this.nexradButton, "state", "");
        }
        if (currMap == 1) {
            Avionics.Utils.diffAndSet(this.wxRadarButton_text, "WX RADAR Settings");
            Avionics.Utils.diffAndSetAttribute(this.wxRadarButton, "state", "Active");
        }
        else {
            Avionics.Utils.diffAndSet(this.wxRadarButton_text, "WX RADAR Horizontal");
            Avionics.Utils.diffAndSetAttribute(this.wxRadarButton, "state", "");
        }
        if (currMap == 2) {
            Avionics.Utils.diffAndSet(this.wxRadarVertButton_text, "WX RADAR Settings");
            Avionics.Utils.diffAndSetAttribute(this.wxRadarVertButton, "state", "Active");
        }
        else {
            Avionics.Utils.diffAndSet(this.wxRadarVertButton_text, "WX RADAR Vertical");
            Avionics.Utils.diffAndSetAttribute(this.wxRadarVertButton, "state", "");
        }
    }
}
class AS3000_TSC_DirectTo extends NavSystemTouch_DirectTo {
    onEnter() {
        super.onEnter();
        this.gps.setTopKnobText("");
        this.gps.setBottomKnobText("-Range+ Push: Pan");
        this.gps.activateNavButton(1, "Cancel", this.gps.goBack.bind(this.gps), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }
    onEvent(_event) {
    }
    openKeyboard() {
        this.gps.fullKeyboard.getElementOfType(AS3000_TSC_FullKeyboard).setContext(this.endKeyboard.bind(this));
        this.gps.switchToPopUpPage(this.gps.fullKeyboard);
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
}
class AS3000_TSC_ActiveFPL extends NavSystemTouch_ActiveFPL {
    init(root) {
        this.directToButton = this.gps.getChildById("AFPL_Drct");
        this.flightPlanDiv = this.gps.getChildById("flightPlan");
        this.waypointsBody = this.gps.getChildById("AFPL_WaypointsBody");
        this.fplName = this.gps.getChildById("AFPL_Name");
        this.origin = this.gps.getChildById("AFPL_Origin");
        this.origin_mainText = this.origin.getElementsByClassName("mainText")[0];
        this.origin_mainValue = this.origin.getElementsByClassName("mainValue")[0];
        this.origin_wayPoint.base = this.gps.getChildById("AFPL_OriginWaypoint");
        this.origin_wayPoint.identButton = this.origin_wayPoint.base.getElementsByClassName("gradientButton")[0];
        this.origin_wayPoint.identButton_Ident = this.origin_wayPoint.identButton.getElementsByClassName("mainValue")[0];
        this.origin_wayPoint.identButton_Name = this.origin_wayPoint.identButton.getElementsByClassName("title")[0];
        this.origin_wayPoint.identButton_Logo = this.origin_wayPoint.identButton.getElementsByClassName("symbol")[0];
        this.origin_wayPoint.index = 0;
        this.enRoute = this.gps.getChildById("AFPL_EnRoute");
        this.enRouteAdd = this.gps.getChildById("AFPL_EnRouteAdd");
        this.destination = this.gps.getChildById("AFPL_Destination");
        this.destination_mainText = this.destination.getElementsByClassName("mainText")[0];
        this.destination_mainValue = this.destination.getElementsByClassName("mainValue")[0];
        this.destination_wayPoint.base = this.gps.getChildById("AFPL_DestinationWaypoint");
        this.destination_wayPoint.identButton = this.destination_wayPoint.base.getElementsByClassName("gradientButton")[0];
        this.destination_wayPoint.identButton_Ident = this.destination_wayPoint.identButton.getElementsByClassName("mainValue")[0];
        this.destination_wayPoint.identButton_Name = this.destination_wayPoint.identButton.getElementsByClassName("title")[0];
        this.destination_wayPoint.identButton_Logo = this.destination_wayPoint.identButton.getElementsByClassName("symbol")[0];
        this.destination_wayPoint.altButton = this.destination_wayPoint.base.getElementsByClassName("gradientButton")[1];
        this.destination_wayPoint.altButton_Value = this.destination_wayPoint.altButton.getElementsByClassName("mainValue")[0];
        this.destination_wayPoint.distance = this.destination_wayPoint.base.getElementsByClassName("DIS")[0];
        this.destination_wayPoint.dtk = this.destination_wayPoint.base.getElementsByClassName("DTK")[0];
        this.approach = this.gps.getChildById("AFPL_Approach");
        this.approach_mainText = this.approach.getElementsByClassName("mainText")[0];
        this.approach_mainValue = this.approach.getElementsByClassName("mainValue")[0];
        this.CurrentLegArrow = this.gps.getChildById("CurrentLegArrow");
        this.insertBefore_Button = this.gps.getChildById("AFPL_InsertBefore_Button");
        this.insertAfter_Button = this.gps.getChildById("AFPL_InsertAfter_Button");
        this.drct_Button = this.gps.getChildById("AFPL_Drct_Button");
        this.activateLegTo_Button = this.gps.getChildById("AFPL_ActivateLegTo_Button");
        this.removeWaypoint_Button = this.gps.getChildById("AFPL_RemoveWaypoint_Button");
        this.AFPL_EnRouteAdd = this.gps.getChildById("AFPL_EnRouteAdd");
        this.AddEnrouteButton = this.gps.getChildById("AddEnrouteButton");
        this.AddEnrouteDone = this.gps.getChildById("AddEnrouteDone");
        this.selectOriginAirportButton = this.gps.getChildById("AFPL_SelectOrigin_Button");
        this.selectDestinationAirportButton = this.gps.getChildById("AFPL_SelectDest_Button");
        this.altitudeKeyboard = new NavSystemElementContainer("Altitude Keyboard", "altitudeKeyboard", new NavSystemTouch_AltitudeKeyboard());
        this.altitudeKeyboard.setGPS(this.gps);
        this.gps.makeButton(this.directToButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Direct To"));
        this.gps.makeButton(this.origin, this.originClick.bind(this));
        this.gps.makeButton(this.origin_wayPoint.identButton, this.originWaypointClick.bind(this));
        this.gps.makeButton(this.destination, this.destinationClick.bind(this));
        this.gps.makeButton(this.destination_wayPoint.identButton, this.destinationWaypointClick.bind(this));
        this.gps.makeButton(this.destination_wayPoint.altButton, this.editAltitude.bind(this, 0, 4));
        this.gps.makeButton(this.insertBefore_Button, this.insertBefore.bind(this));
        this.gps.makeButton(this.insertAfter_Button, this.insertAfter.bind(this));
        this.gps.makeButton(this.drct_Button, this.directTo.bind(this));
        this.gps.makeButton(this.activateLegTo_Button, this.activateLegTo.bind(this));
        this.gps.makeButton(this.removeWaypoint_Button, this.removeWaypoint.bind(this));
        this.gps.makeButton(this.AddEnrouteButton, this.addEnroute.bind(this));
        this.gps.makeButton(this.AddEnrouteDone, this.enrouteDone.bind(this));
        this.gps.makeButton(this.selectOriginAirportButton, this.selectOrigin.bind(this));
        this.gps.makeButton(this.selectDestinationAirportButton, this.selectDestination.bind(this));

        this.altitudeKeyboard.element = new AS3000_TSC_AltitudeKeyboard();

        this.scrollController = new WT_TouchScrollController(this.waypointsBody, 2000, 0, 5);
    }

    onUpdate(_deltaTime) {
        this.scrollController.update();
        this._t++;
        if (this._t > 30) {
            this.gps.currFlightPlanManager.updateFlightPlan(this.updateDisplay.bind(this));
            this._t = 0;
        }
        this.updateDisplay();
    }

    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }

    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
        this.gps.deactivateNavButton(5, false);
        this.gps.deactivateNavButton(6, false);
    }

    back() {
        this.gps.goBack();
    }

    scrollUp() {
        if (this.currentMenu == 1) {
            // right-side waypoint menu open and set to non-origin/dest waypoint
            if (this.selectedWaypoint == 0) {
                // current selected waypoint is the first waypoint in its phase
                let ok = false;
                let length;
                this.unselectLastButton();
                do {
                    switch (this.selectedGroup) {
                        case 0:
                            // origin waypoint selected; can't scroll up any further, so reselect origin waypoint.
                        case 1:
                            // first dep waypoint selected, so now select origin waypoint
                            this.selectedGroup = 0;
                            this.selectedWaypoint = 0;
                            this.selectedElement = this.origin_wayPoint;
                            this.origin_wayPoint.identButton.setAttribute("state", "SelectedWP");
                            ok = true;
                            break;
                        case 2:
                            // first enr waypoint selected, so now attempt to select the last dep waypoint
                            this.selectedGroup = 1;
                            length = this.gps.currFlightPlanManager.getDepartureWaypointsMap().length;
                            if (length > 0) {
                                this.selectedWaypoint = length - 1;
                                this.selectedElement = this.departureWaypoints[this.selectedWaypoint];
                                this.departureWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                                ok = true;
                            }
                            break;
                        case 3:
                            // first arr waypoint selected, so now attempt to select the last enr waypoint
                            this.selectedGroup = 2;
                            length = this.gps.currFlightPlanManager.getEnRouteWaypoints().length;
                            if (length > 0) {
                                this.selectedWaypoint = length - 1;
                                this.selectedElement = this.enRouteWaypoints[this.selectedWaypoint];
                                this.enRouteWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                                ok = true;
                            }
                            break;
                        case 4:
                            // dest waypoint selected, so now attempt to select the last arr waypoint
                            this.selectedGroup = 3;
                            length = this.gps.currFlightPlanManager.getArrivalWaypointsMap().length;
                            if (length > 0) {
                                this.selectedWaypoint = length - 1;
                                this.selectedElement = this.arrivalWaypoints[this.selectedWaypoint];
                                this.arrivalWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                                ok = true;
                            }
                            break;
                        case 5:
                            // first appr waypoint selected, so now attempt to select dest waypoint
                            this.selectedGroup = 4;
                            if (this.gps.currFlightPlanManager.getDestination()) {
                                this.selectedWaypoint = 0;
                                this.selectedElement = this.destination_wayPoint;
                                this.destination_wayPoint.identButton.setAttribute("state", "SelectedWP");
                                ok = true;
                            }
                            break;
                    }
                } while (!ok);
            } else {
                this.unselectLastButton();
                this.selectedWaypoint--;
                switch (this.selectedGroup) {
                    case 1:
                        this.selectedElement = this.departureWaypoints[this.selectedWaypoint];
                        this.departureWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                        break;
                    case 2:
                        this.selectedElement = this.enRouteWaypoints[this.selectedWaypoint];
                        this.enRouteWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                        break;
                    case 3:
                        this.selectedElement = this.arrivalWaypoints[this.selectedWaypoint];
                        this.arrivalWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                        break;
                    case 5:
                        this.selectedElement = this.approachWaypoints[this.selectedWaypoint];
                        this.approachWaypoints[this.selectedWaypoint].identButton.setAttribute("state", "SelectedWP");
                        break;
                }
            }
            this.updateMenu();
            this.scrollController.scrollToElement(this.selectedElement.identButton);
        } else {
            this.scrollController.scrollUp();
        }
    }

    scrollDown() {
        if (this.currentMenu == 1) {
            // right-side waypoint menu open and set to non-origin/dest waypoint
            let isOk = false;
            let length;
            this.unselectLastButton();

            switch (this.selectedGroup) {
                case 0:
                    // origin waypoint selected, so now attempt to select first dep waypoint.
                    if (this.gps.currFlightPlanManager.getDepartureWaypointsMap().length > 0) {
                        this.selectedGroup = 1;
                        this.selectedWaypoint = 0;
                        this.selectedElement = this.departureWaypoints[0];
                        break;
                    }
                case 1:
                    // dep waypoint selected.
                    length = this.gps.currFlightPlanManager.getDepartureWaypointsMap().length;
                    if (this.selectedWaypoint >= length - 1) {
                        if (this.gps.currFlightPlanManager.getEnRouteWaypoints().length > 0) {
                            this.selectedGroup = 2;
                            this.selectedWaypoint = 0;
                            this.selectedElement = this.enRouteWaypoints[0];
                            break;
                        }
                    } else {
                        this.selectedGroup = 1;
                        this.selectedWaypoint++;
                        this.selectedElement = this.departureWaypoints[this.selectedWaypoint];
                        break;
                    }
                case 2:
                    // enr waypoint selected.
                    length = this.gps.currFlightPlanManager.getEnRouteWaypoints().length;
                    if (this.selectedWaypoint >= length - 1) {
                        if (this.gps.currFlightPlanManager.getArrivalWaypointsMap().length > 0) {
                            this.selectedGroup = 3
                            this.selectedWaypoint = 0;
                            this.selectedElement = this.arrivalWaypoints[0];
                            break;
                        }
                    } else {
                        this.selectedGroup = 2;
                        this.selectedWaypoint++;
                        this.selectedElement = this.enRouteWaypoints[this.selectedWaypoint];
                        break;
                    }
                case 3:
                    // arr waypoint selected.
                    length = this.gps.currFlightPlanManager.getArrivalWaypointsMap().length;
                    if (this.selectedWaypoint >= length - 1) {
                        if (this.gps.currFlightPlanManager.getDestination()) {
                            this.selectedGroup = 4;
                            this.selectedWaypoint = 0;
                            this.selectedElement = this.destination_wayPoint;
                            break;
                        }
                    } else {
                        this.selectedGroup = 3;
                        this.selectedWaypoint++;
                        this.selectedElement = this.arrivalWaypoints[this.selectedWaypoint];
                        break;
                    }
                case 4:
                    // dest waypoint selected.
                    length = this.gps.currFlightPlanManager.getApproachWaypoints().length;
                    if (length > 0) {
                        this.selectedGroup = 5;
                        this.selectedWaypoint = 0;
                        this.selectedElement = this.approachWaypoints[0];
                        break;
                    }
                case 5:
                    // appr waypoint selected.
                    length = this.gps.currFlightPlanManager.getApproachWaypoints().length;
                    if (this.selectedWaypoint < length - 1) {
                        this.selectedGroup = 5;
                        this.selectedWaypoint++;
                        this.selectedElement = this.approachWaypoints[this.selectedWaypoint];
                    }
            }

            this.selectedElement.identButton.setAttribute("state", "SelectedWP");

            this.scrollController.scrollToElement(this.selectedElement.identButton);
            this.updateMenu();
        } else {
            this.scrollController.scrollDown();
        }
    }
}
class AS3000_TSC_Procedures extends NavSystemTouch_Procedures {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
}
class AS3000_TSC_DepartureSelection extends NavSystemTouch_DepartureSelection {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
    close() {
        this.gps.SwitchToPageName("MFD", "Procedures");
    }
}
class AS3000_TSC_ArrivalSelection extends NavSystemTouch_ArrivalSelection {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
    close() {
        this.gps.SwitchToPageName("MFD", "Procedures");
    }
}
class AS3000_TSC_ApproachSelection extends NavSystemTouch_ApproachSelection {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
    }
    back() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
    close() {
        this.gps.SwitchToPageName("MFD", "Procedures");
    }
}

/*
 * Aircraft Systems Page (via MFD Home)
 */
class AS3000_TSC_AircraftSystems extends NavSystemElement {
    init(root) {
        this.lightingButton = this.gps.getChildById("LightingConfigButton");

        this.gps.makeButton(this.lightingButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Lighting Configuration"));
    }
    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onUpdate(_deltaTime) {
    }
    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }
    onEvent(_event) {
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        return true;
    }
}

/*
 * Lighting Configuration Page (via Aircraft Systems Page): controls backlighting of PFD, MFD, and touchscreen, and all G3000 bezel keys/knobs
 */
class AS3000_TSC_LightingConfig extends NavSystemElement {
    init(root) {
        this.slider = this.gps.getChildById("LightingConfigSlider");
        this.slider.addEventListener("input", this.syncLightingToSlider.bind(this));
        this.sliderBackground = this.gps.getChildById("LightingConfigSliderBackground");
        this.display = this.gps.getChildById("LightingValueDisplay");
        this.displayValue = this.display.getElementsByClassName("value")[0];

        this.updateSlider();

        this.decButton = this.gps.getChildById("LightingDecreaseButton");
        this.incButton = this.gps.getChildById("LightingIncreaseButton");

        this.gps.makeButton(this.decButton, this.changeLighting.bind(this, -0.01));
        this.gps.makeButton(this.incButton, this.changeLighting.bind(this, 0.01));
    }

    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    onUpdate(deltaTime) {
        this.updateSlider();
    }

    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }

    onEvent(_event) {
    }

    back() {
        this.gps.goBack();
        return true;
    }

    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        return true;
    }

    updateSlider() {
        let currValue = SimVar.GetSimVarValue("L:XMLVAR_AS3000_DisplayLighting", "number") * 100;
        let displayValue = fastToFixed(currValue, 0)
        Avionics.Utils.diffAndSet(this.displayValue, currValue.toFixed(0) + "%"); // update readout display
        this.slider.value = currValue;
        this.sliderBackground.style.webkitClipPath = "polygon(0 0, " + displayValue + "% 0, " + displayValue + "% 100%, 0 100%)"; // update the range slider's track background to only show on the left of the thumb
    }

    syncLightingToSlider() {
        this.setLightingValue(parseInt(this.slider.value) / 100.0);
    }

    changeLighting(_delta) {
        this.setLightingValue(Math.min(Math.max(SimVar.GetSimVarValue("L:XMLVAR_AS3000_DisplayLighting", "number") + _delta, 0.01), 1));
    }

    setLightingValue(value) {
        SimVar.SetSimVarValue("L:XMLVAR_AS3000_DisplayLighting", "number", value);
        this.updateDataStore(value);
    }

    updateDataStore(value) {
        WTDataStore.set(AS3000_TSC_LightingConfig.VARNAME_DISPLAY_LIGHTING, value);
    }
}
AS3000_TSC_LightingConfig.VARNAME_DISPLAY_LIGHTING = "Display_Lighting";

/*
 * Utilities Page (via MFD Home)
 */
class AS3000_TSC_Utilities extends NavSystemElement {
    init(root) {
        this.setupButton = this.gps.getChildById("SetupButton");

        this.gps.makeButton(this.setupButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Setup"));
    }

    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    onUpdate(_deltaTime) {
    }

    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }

    onEvent(_event) {
    }

    back() {
        this.gps.goBack();
        return true;
    }

    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        return true;
    }
}

/*
 * Setup Page (via Utilities)
 */
class AS3000_TSC_UtilitiesSetup extends NavSystemElement {
    init(root) {
        this.avionicsSettingsButton = this.gps.getChildById("AvionicsSettingsButton");

        this.gps.makeButton(this.avionicsSettingsButton, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Avionics Settings"));
    }

    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    onUpdate(_deltaTime) {
    }

    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }

    onEvent(_event) {
    }

    back() {
        this.gps.goBack();
        return true;
    }

    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        return true;
    }
}

class AS3000_TSC_WaypointInfo extends NavSystemElement {
    init(root) {
        this.airportBtn = this.gps.getChildById("WPInfoAirport_Btn");
        this.intBtn = this.gps.getChildById("WPInfoINT_Btn");
        this.vorBtn = this.gps.getChildById("WPInfoVOR_Btn");
        this.ndbBtn = this.gps.getChildById("WPInfoNDB_Btn");
        this.gps.makeButton(this.airportBtn, this._onAirportButtonPressed.bind(this));
    }
    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    _onAirportButtonPressed() {
        this.gps.SwitchToPageName("MFD", this.gps.getSelectedMFDPanePages().airportInfo.name);
    }

    onUpdate(_deltaTime) {
    }
    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }
    onEvent(_event) {
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
}
class AS3000_TSC_AirportInfo_FreqLine {
}
class AS3000_TSC_AirportInfo_RunwayLine {
}
class AS3000_TSC_AirportInfo extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.frequencyElements = [];
        this.runwayElements = [];
        this.showInMap = false;

        this.tabbedContent = new WT_TSCTabbedContent(this);
    }
    init(root) {
        this.geoCalc = new GeoCalcInfo(this.gps);
        this.centerDisplay = (root.getElementsByClassName("CenterDisplay")[0]);
        this.infoTab = this.gps.getChildById("AirportInfo_InfoTab");
        this.freqsTab = this.gps.getChildById("AirportInfo_FreqsTab");
        this.runwaysTab = this.gps.getChildById("AirportInfo_RunwaysTab");
        this.activeTab = this.infoTab;
        this.airportSelection = this.gps.getChildById("AirportInfo_SelectedWaypoint");
        this.airportSelection_mainText = this.airportSelection.getElementsByClassName("mainText")[0];
        this.airportSelection_mainValue = this.airportSelection.getElementsByClassName("mainValue")[0];
        this.airportSelection_title = this.airportSelection.getElementsByClassName("title")[0];
        this.airportSelection_symbol = this.airportSelection.getElementsByClassName("waypointSymbol")[0];
        this.waypointOptions = this.gps.getChildById("AirportInfo_Options");
        this.city = (root.getElementsByClassName("city")[0]);
        this.region = (root.getElementsByClassName("region")[0]);
        this.bearing_value = (root.getElementsByClassName("bearing_value")[0]);
        this.distance_value = (root.getElementsByClassName("distance_value")[0]);
        this.latitude = (root.getElementsByClassName("latitude")[0]);
        this.longitude = (root.getElementsByClassName("longitude")[0]);
        this.elev_value = (root.getElementsByClassName("elev_value")[0]);
        this.time_value = (root.getElementsByClassName("time_value")[0]);
        this.fuel_value = (root.getElementsByClassName("fuel_value")[0]);
        this.privacy = (root.getElementsByClassName("privacy")[0]);
        this.frequencyTable = (root.getElementsByClassName("Freqs")[0]);
        this.frequencyScrollElement = new NavSystemTouch_ScrollElement();
        this.frequencyScrollElement.elementContainer = this.frequencyTable;
        this.frequencyScrollElement.elementSize = this.frequencyTable.getBoundingClientRect().height / 4;
        this.runwayTable = (root.getElementsByClassName("Runways")[0]);
        this.runwaysScrollElement = new NavSystemTouch_ScrollElement();
        this.runwaysScrollElement.elementContainer = this.runwayTable;
        this.runwaysScrollElement.elementSize = this.runwayTable.getBoundingClientRect().height / 3;
        this.gps.makeButton(this.infoTab, this.switchPage.bind(this, "Info", this.infoTab));
        this.gps.makeButton(this.freqsTab, this.switchPage.bind(this, "Freqs", this.freqsTab));
        this.gps.makeButton(this.runwaysTab, this.switchPage.bind(this, "Runways", this.runwaysTab));
        this.gps.makeButton(this.airportSelection, this.openKeyboard.bind(this));
        this.gps.makeButton(this.waypointOptions, this.openOptions.bind(this));
        this.tabbedContent.init(root.getElementsByClassName("tabContainer")[0]);
    }
    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        if (this.currPage == "Freqs") {
            this.gps.activateNavButton(5, "Up", this.scrollUpFreq.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
            this.gps.activateNavButton(6, "Down", this.scrollDownFreq.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
        }
        else if (this.currPage == "Runways") {
            this.gps.activateNavButton(5, "Up", this.scrollUpRunways.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
            this.gps.activateNavButton(6, "Down", this.scrollDownRunways.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
        }
        if (this.airport && this.showInMap) {
            let infos = this.airport.infos;
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", infos.lat);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", infos.long);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 1);
        }
        if (this.gps.lastRelevantICAO) {
            this.endKeyboard(this.gps.lastRelevantICAO);
            this.gps.lastRelevantICAO = null;
        }
    }
    onUpdate(_deltaTime) {
        if (this.frequencyScrollElement.elementSize == 0) {
            this.frequencyScrollElement.elementSize = this.frequencyTable.getBoundingClientRect().height / 4;
        }
        this.frequencyScrollElement.update();
        if (this.runwaysScrollElement.elementSize == 0) {
            this.runwaysScrollElement.elementSize = this.runwayTable.getBoundingClientRect().height / 3;
        }
        this.runwaysScrollElement.update();
        if (this.airport) {
            let infos = this.airport.infos;
            if (infos.lat && infos.long) {
                this.geoCalc.SetParams(SimVar.GetSimVarValue("PLANE LATITUDE", "degree"), SimVar.GetSimVarValue("PLANE LONGITUDE", "degree"), infos.lat, infos.long, true);
                this.geoCalc.Compute(this.onEndGeoCalc.bind(this));
            }
        }
    }
    onEndGeoCalc() {
        Avionics.Utils.diffAndSet(this.bearing_value, fastToFixed(this.geoCalc.bearing, 0) + "°");
        Avionics.Utils.diffAndSet(this.distance_value, fastToFixed(this.geoCalc.distance, 0) + "NM");
    }
    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
        this.gps.deactivateNavButton(5);
        this.gps.deactivateNavButton(6);
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 0);
        if (this.airport) {
            this.gps.lastRelevantICAOType = "A";
            this.gps.lastRelevantICAO = this.airport.infos.icao;
        }
        this.showInMap = false;
    }
    onEvent(_event) {
    }
    openKeyboard() {
        this.gps.deactivateNavButton(5);
        this.gps.deactivateNavButton(6);
        this.gps.fullKeyboard.element.setContext(this.endKeyboard.bind(this), "A");
        this.gps.switchToPopUpPage(this.gps.fullKeyboard);
    }
    endKeyboard(_icao) {
        if (_icao != "") {
            this.airport = new WayPoint(this.gps);
            this.airport.type = "A";
            this.gps.facilityLoader.getFacilityCB(_icao, (wp) => {
                this.airport = wp;
                this.onLoadEnd();
            });
        }
        else {
            this.airport = null;
            this.onLoadEnd();
        }
    }
    onLoadEnd() {
        if (this.airport) {
            let infos = this.airport.infos;
            this.city.textContent = infos.city ? infos.city : "";
            this.region.textContent = infos.region ? infos.region : "";
            this.latitude.textContent = infos.lat ? this.gps.latitudeFormat(infos.lat) : "";
            this.longitude.textContent = infos.long ? this.gps.longitudeFormat(infos.long) : "";
            this.elev_value.textContent = infos.coordinates && infos.coordinates.alt ? fastToFixed(infos.coordinates.alt, 0) + "FT" : "";
            this.fuel_value.textContent = infos.fuel ? infos.fuel : "";
            switch (infos.privateType) {
                case 0:
                    this.privacy.textContent = "UNKNOWN";
                    break;
                case 1:
                    this.privacy.textContent = "PUBLIC";
                    break;
                case 2:
                    this.privacy.textContent = "MILITARY";
                    break;
                case 3:
                    this.privacy.textContent = "PRIVATE";
                    break;
            }
            this.airportSelection_mainText.textContent = "";
            this.airportSelection_mainValue.textContent = infos.ident;
            this.airportSelection_title.textContent = infos.name;
            let symbol = infos.imageFileName();
            this.airportSelection_symbol.setAttribute("src", symbol != "" ? "/Pages/VCockpit/Instruments/Shared/Map/Images/" + symbol : "");
            for (let i = 0; i < infos.frequencies.length; i++) {
                if (i >= this.frequencyElements.length) {
                    let freqLine = new AS3000_TSC_AirportInfo_FreqLine();
                    freqLine.frequency = infos.frequencies[i];
                    freqLine.lineElem = document.createElement("div");
                    freqLine.lineElem.setAttribute("class", "line");
                    this.frequencyTable.appendChild(freqLine.lineElem);
                    freqLine.freqNameElem = document.createElement("div");
                    freqLine.freqNameElem.setAttribute("class", "frequencyName");
                    freqLine.lineElem.appendChild(freqLine.freqNameElem);
                    let buttonContainer = document.createElement("div");
                    buttonContainer.setAttribute("class", "buttonContainer");
                    freqLine.lineElem.appendChild(buttonContainer);
                    freqLine.buttonElem = document.createElement("div");
                    freqLine.buttonElem.setAttribute("class", "gradientButton");
                    buttonContainer.appendChild(freqLine.buttonElem);
                    freqLine.frequencyElem = document.createElement("div");
                    freqLine.frequencyElem.setAttribute("class", "mainText");
                    freqLine.buttonElem.appendChild(freqLine.frequencyElem);
                    this.gps.makeButton(freqLine.buttonElem, this.frequencyButtonCallback.bind(this, freqLine));
                    this.frequencyElements.push(freqLine);
                    if (i == 0) {
                        this.frequencyScrollElement.elementSize = freqLine.lineElem.getBoundingClientRect().height;
                    }
                }
                this.frequencyElements[i].frequency = infos.frequencies[i];
                this.frequencyElements[i].freqNameElem.textContent = this.frequencyElements[i].frequency.name;
                this.frequencyElements[i].frequencyElem.textContent = this.frequencyElements[i].frequency.mhValue.toFixed(2);
                this.frequencyElements[i].lineElem.style.display = "block";
            }
            for (let i = infos.frequencies.length; i < this.frequencyElements.length; i++) {
                this.frequencyElements[i].lineElem.style.display = "none";
            }
            for (let i = 0; i < infos.runways.length; i++) {
                if (i >= this.runwayElements.length) {
                    let runwayLine = new AS3000_TSC_AirportInfo_RunwayLine();
                    runwayLine.runway = infos.runways[i];
                    runwayLine.lineElem = document.createElement("div");
                    runwayLine.lineElem.setAttribute("class", "line");
                    this.runwayTable.appendChild(runwayLine.lineElem);
                    runwayLine.nameElem = document.createElement("div");
                    runwayLine.nameElem.setAttribute("class", "name");
                    runwayLine.lineElem.appendChild(runwayLine.nameElem);
                    runwayLine.sizeElem = document.createElement("div");
                    runwayLine.sizeElem.setAttribute("class", "size");
                    runwayLine.lineElem.appendChild(runwayLine.sizeElem);
                    runwayLine.surfaceElem = document.createElement("div");
                    runwayLine.surfaceElem.setAttribute("class", "surface");
                    runwayLine.lineElem.appendChild(runwayLine.surfaceElem);
                    runwayLine.lightingElem = document.createElement("div");
                    runwayLine.lightingElem.setAttribute("class", "lighting");
                    runwayLine.lineElem.appendChild(runwayLine.lightingElem);
                    this.runwayElements.push(runwayLine);
                    if (i == 0) {
                        this.runwaysScrollElement.elementSize = runwayLine.lineElem.getBoundingClientRect().height;
                    }
                }
                this.runwayElements[i].runway = infos.runways[i];
                this.runwayElements[i].nameElem.textContent = infos.runways[i].designation;
                this.runwayElements[i].sizeElem.textContent = Math.round(WT_Unit.METER.convert(infos.runways[i].length, WT_Unit.FOOT)) + "FT x " +
                    Math.round(WT_Unit.METER.convert(infos.runways[i].width, WT_Unit.FOOT)) + "FT";
                this.runwayElements[i].surfaceElem.textContent = infos.runways[i].getSurfaceString();
                let lighting = "Unknown";
                switch (infos.runways[i].lighting) {
                    case 1:
                        lighting = "None";
                        break;
                    case 2:
                        lighting = "Part Time";
                        break;
                    case 3:
                        lighting = "Full Time";
                        break;
                    case 4:
                        lighting = "Frequency";
                        break;
                }
                this.runwayElements[i].lightingElem.textContent = lighting;
                this.runwayElements[i].lineElem.style.display = "block";
            }
            for (let i = infos.runways.length; i < this.runwayElements.length; i++) {
                this.runwayElements[i].lineElem.style.display = "none";
            }
            if (this.showInMap) {
                SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", infos.lat);
                SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", infos.long);
                SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 1);
            }
        }
        else {
        }
    }
    switchPage(_page, _button) {
        this.gps.deactivateNavButton(5);
        this.gps.deactivateNavButton(6);
        this.currPage = _page;
        this.centerDisplay.setAttribute("state", _page);
        if (this.activeTab) {
            this.activeTab.setAttribute("state", "");
        }
        _button.setAttribute("state", "White");
        this.activeTab = _button;
        if (_page == "Freqs") {
            this.gps.activateNavButton(5, "Up", this.scrollUpFreq.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
            this.gps.activateNavButton(6, "Down", this.scrollDownFreq.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
        }
        else if (this.currPage == "Runways") {
            this.gps.activateNavButton(5, "Up", this.scrollUpRunways.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
            this.gps.activateNavButton(6, "Down", this.scrollDownRunways.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
        }
    }
    frequencyButtonCallback(_freqLine) {
        this.gps.deactivateNavButton(5);
        this.gps.deactivateNavButton(6);
        this.gps.loadFrequencyWindow.element.setContext(_freqLine.frequency.mhValue.toFixed(2) + " " + this.airport.ident + " " + _freqLine.frequency.name, _freqLine.frequency.bcd16Value, _freqLine.frequency.mhValue < 118);
        this.gps.switchToPopUpPage(this.gps.loadFrequencyWindow);
    }
    scrollUpFreq() {
        this.frequencyScrollElement.scrollUp();
    }
    scrollDownFreq() {
        this.frequencyScrollElement.scrollDown();
    }
    scrollUpRunways() {
        this.runwaysScrollElement.scrollUp();
    }
    scrollDownRunways() {
        this.runwaysScrollElement.scrollDown();
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    showInMapToggle() {
        this.showInMap = !this.showInMap;
        if (this.airport && this.showInMap) {
            let infos = this.airport.GetInfos();
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", infos.lat);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", infos.long);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 1);
        }
        if (!this.showInMap) {
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", 0);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", 0);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 0);
        }
    }
    showInMapStatus() {
        return this.showInMap;
    }
    openOptions() {
        this.gps.waypointOptions.element.setContext(this.airport.icao, this.showInMapStatus.bind(this), this.showInMapToggle.bind(this));
        this.gps.switchToPopUpPage(this.gps.waypointOptions);
    }
}
class AS3000_TSC_NRST extends NavSystemElement {
    init(root) {
        this.Airport = this.gps.getChildById("NrstAirport_Btn");
        this.INT = this.gps.getChildById("NrstInt_Btn");
        this.VOR = this.gps.getChildById("NrstVor_Btn");
        this.NDB = this.gps.getChildById("NrstNdb_Btn");
        this.User = this.gps.getChildById("NrstUser_Btn");
        this.Airspace = this.gps.getChildById("NrstAirspace_Btn");
        this.ARTCC = this.gps.getChildById("NrstARTCC_Btn");
        this.FSS = this.gps.getChildById("NrstFSS_Btn");
        this.Weather = this.gps.getChildById("NrstWeather_Btn");
        this.gps.makeButton(this.Airport, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Nearest Airport"));
        this.gps.makeButton(this.INT, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Nearest Intersection"));
        this.gps.makeButton(this.VOR, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Nearest VOR"));
        this.gps.makeButton(this.NDB, this.gps.SwitchToPageName.bind(this.gps, "MFD", "Nearest NDB"));
    }
    onEnter() {
        this.gps.setTopKnobText("");
        this.gps.setBottomKnobText("-Range+ Push: Pan");
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }
    onUpdate(_deltaTime) {
    }
    onExit() {
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
    }
    onEvent(_event) {
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
}
class AS3000_TSC_NRST_Airport_Line {
    constructor() {
        this.base = window.document.createElement("tr");
        {
            let td1 = window.document.createElement("td");
            {
                this.identButton = window.document.createElement("div");
                this.identButton.setAttribute("class", "gradientButton Waypoint");
                {
                    this.ident = window.document.createElement("div");
                    this.ident.setAttribute("class", "mainValue");
                    this.identButton.appendChild(this.ident);
                    this.name = window.document.createElement("div");
                    this.name.setAttribute("class", "title");
                    this.identButton.appendChild(this.name);
                    this.symbol = window.document.createElement("img");
                    this.symbol.setAttribute("class", "symbol");
                    this.identButton.appendChild(this.symbol);
                }
                td1.appendChild(this.identButton);
            }
            this.base.appendChild(td1);
            let td2 = window.document.createElement("td");
            {
                this.bearingArrow = window.document.createElement("img");
                this.bearingArrow.setAttribute("src", "/Pages/VCockpit/Instruments/NavSystems/Shared/Images/Misc/BlueArrow.svg");
                td2.appendChild(this.bearingArrow);
                this.bearingText = window.document.createElement("div");
                td2.appendChild(this.bearingText);
            }
            this.base.appendChild(td2);
            let td3 = window.document.createElement("td");
            {
                this.distance = window.document.createElement("div");
                td3.appendChild(this.distance);
            }
            this.base.appendChild(td3);
            let td4 = window.document.createElement("td");
            {
                this.appr = window.document.createElement("div");
                td4.appendChild(this.appr);
                this.runway = window.document.createElement("div");
                td4.appendChild(this.runway);
            }
            this.base.appendChild(td4);
        }
    }
}
class AS3000_TSC_NRST_Airport extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.airportLines = [];
        this.selectedElement = -1;
        this.showOnMap = false;
    }
    init(root) {
        this.table = root.getElementsByClassName("NearestList")[0];
        this.body = this.table.getElementsByTagName("tbody")[0];
        this.menu = root.getElementsByClassName("SelectionMenu")[0];
        this.drct_button = this.gps.getChildById("NrstAirport_Drct");
        this.insertFpl_button = this.gps.getChildById("NrstAirport_InsertInFpl");
        this.airportInfos_button = this.gps.getChildById("NrstAirport_AirportInfo");
        this.airportChart_button = this.gps.getChildById("NrstAirport_AirportChart");
        this.showOnMap_button = this.gps.getChildById("NrstAirport_ShowOnMap");
        this.nearestAirports = new NearestAirportList(this.gps);
        this.scrollElement = new NavSystemTouch_ScrollElement();
        this.scrollElement.elementContainer = this.body;
        this.scrollElement.elementSize = this.airportLines.length > 2 ? this.airportLines[1].base.getBoundingClientRect().height : 0;
        this.gps.makeButton(this.drct_button, this.directTo.bind(this));
        this.gps.makeButton(this.insertFpl_button, this.insertInFpl.bind(this));
        this.gps.makeButton(this.airportInfos_button, this.airportInfo.bind(this));
        this.gps.makeButton(this.showOnMap_button, this.showOnMapToggle.bind(this));
    }
    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onUpdate(_deltaTime) {
        if (this.scrollElement.elementSize == 0) {
            this.scrollElement.elementSize = this.airportLines.length > 2 ? this.airportLines[1].base.getBoundingClientRect().height : 0;
        }
        this.scrollElement.update();
        this.nearestAirports.Update(25, 200);
        for (let i = 0; i < this.nearestAirports.airports.length; i++) {
            if (this.airportLines.length < i + 1) {
                let newLine = new AS3000_TSC_NRST_Airport_Line();
                this.body.appendChild(newLine.base);
                this.gps.makeButton(newLine.identButton, this.clickOnElement.bind(this, i));
                this.airportLines.push(newLine);
            }
            let infos = this.nearestAirports.airports[i];
            Avionics.Utils.diffAndSet(this.airportLines[i].ident, infos.ident);
            Avionics.Utils.diffAndSet(this.airportLines[i].name, infos.name);
            let symbol = infos.imageFileName();
            Avionics.Utils.diffAndSetAttribute(this.airportLines[i].symbol, "src", symbol != "" ? "/Pages/VCockpit/Instruments/Shared/Map/Images/" + symbol : "");
            Avionics.Utils.diffAndSetAttribute(this.airportLines[i].bearingArrow, "style", "transform: rotate(" + fastToFixed(infos.bearing - SimVar.GetSimVarValue("PLANE HEADING DEGREES MAGNETIC", "degree"), 3) + "deg)");
            Avionics.Utils.diffAndSet(this.airportLines[i].bearingText, fastToFixed(infos.bearing, 0) + "°");
            Avionics.Utils.diffAndSet(this.airportLines[i].distance, fastToFixed(infos.distance, 1) + "NM");
            Avionics.Utils.diffAndSet(this.airportLines[i].runway, fastToFixed(infos.longestRunwayLength, 0) + "FT");
            Avionics.Utils.diffAndSet(this.airportLines[i].appr, infos.bestApproach);
        }
        for (let i = this.nearestAirports.airports.length; i < this.airportLines.length; i++) {
            Avionics.Utils.diffAndSetAttribute(this.airportLines[i].base, "state", "Inactive");
        }
    }
    onExit() {
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
        this.gps.deactivateNavButton(5, false);
        this.gps.deactivateNavButton(6, false);
        if (this.selectedElement != -1) {
            this.gps.lastRelevantICAOType = "A";
            this.gps.lastRelevantICAO = this.nearestAirports.airports[this.selectedElement].icao;
            this.menu.setAttribute("state", "Inactive");
            this.airportLines[this.selectedElement].identButton.setAttribute("state", "None");
            this.selectedElement = -1;
        }
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 0);
    }
    onEvent(_event) {
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        if (this.selectedElement != -1) {
            if (this.selectedElement > 0) {
                this.clickOnElement(this.selectedElement - 1);
                this.scrollElement.scrollUp(true);
            }
        }
        else {
            this.scrollElement.scrollUp();
        }
    }
    scrollDown() {
        if (this.selectedElement != -1) {
            if (this.selectedElement < this.nearestAirports.airports.length - 1) {
                this.clickOnElement(this.selectedElement + 1);
                this.scrollElement.scrollDown(true);
            }
        }
        else {
            this.scrollElement.scrollDown();
        }
    }
    clickOnElement(_index) {
        if (this.selectedElement == _index) {
            this.selectedElement = -1;
            this.menu.setAttribute("state", "Inactive");
            this.airportLines[_index].identButton.setAttribute("state", "None");
        }
        else {
            if (this.selectedElement != -1) {
                this.airportLines[this.selectedElement].identButton.setAttribute("state", "None");
            }
            this.selectedElement = _index;
            Avionics.Utils.diffAndSetAttribute(this.menu, "state", "Active");
            this.airportLines[_index].identButton.setAttribute("state", "SelectedWP");
        }
        if (this.showOnMap) {
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", this.nearestAirports.airports[_index].coordinates.lat);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", this.nearestAirports.airports[_index].coordinates.long);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 1);
        }
    }
    directTo() {
        this.gps.lastRelevantICAO = this.nearestAirports.airports[this.selectedElement].icao;
        this.gps.lastRelevantICAOType = this.nearestAirports.airports[this.selectedElement].type;
        this.gps.SwitchToPageName("MFD", "Direct To");
    }
    insertInFpl() {
        this.gps.insertBeforeWaypoint.getElementOfType(AS3000_TSC_InsertBeforeWaypoint).setContext(this.insertInFplIndexSelectionCallback.bind(this));
        this.gps.switchToPopUpPage(this.gps.insertBeforeWaypoint);
    }
    insertInFplIndexSelectionCallback(_index) {
        this.gps.currFlightPlanManager.addWaypoint(this.nearestAirports.airports[this.selectedElement].icao, _index, () => {
            this.gps.currFlightPlanManager.updateFlightPlan();
            this.gps.SwitchToPageName("MFD", "Active Flight Plan");
        });
    }
    airportInfo() {
        let page = this.gps.getSelectedMFDPanePages().airportInfo;
        page.element.icaoSetting.setValue(this.nearestAirports.airports[this.selectedElement].icao);
        this.gps.SwitchToPageName("MFD", page.name);
    }
    showOnMapToggle() {
        this.showOnMap = !this.showOnMap;
        this.showOnMap_button.setAttribute("state", this.showOnMap ? "Active" : "");
        if (this.showOnMap) {
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", this.nearestAirports.airports[this.selectedElement].coordinates.lat);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", this.nearestAirports.airports[this.selectedElement].coordinates.long);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 1);
        }
        else {
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", 0);
            SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", 0);
            SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 0);
        }
    }
}
class AS3000_TSC_NRST_Intersection extends NavSystemTouch_NRST_Intersection {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
        this.gps.deactivateNavButton(5, false);
        this.gps.deactivateNavButton(6, false);
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLatitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_OverrideLongitude", "number", 0);
        SimVar.SetSimVarValue("L:AS3000_MFD_IsPositionOverride", "number", 0);
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        if (this.selectedElement != -1) {
            if (this.selectedElement > 0) {
                this.clickOnElement(this.selectedElement - 1);
                this.scrollElement.scrollUp(true);
            }
        }
        else {
            this.scrollElement.scrollUp();
        }
    }
    scrollDown() {
        if (this.selectedElement != -1) {
            if (this.selectedElement < this.nearest.intersections.length - 1) {
                this.clickOnElement(this.selectedElement + 1);
                this.scrollElement.scrollDown(true);
            }
        }
        else {
            this.scrollElement.scrollDown();
        }
    }
}
class AS3000_TSC_NRST_VOR extends NavSystemTouch_NRST_VOR {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
        this.gps.deactivateNavButton(5, false);
        this.gps.deactivateNavButton(6, false);
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        if (this.selectedElement != -1) {
            if (this.selectedElement > 0) {
                this.clickOnElement(this.selectedElement - 1);
                this.scrollElement.scrollUp(true);
            }
        }
        else {
            this.scrollElement.scrollUp();
        }
    }
    scrollDown() {
        if (this.selectedElement != -1) {
            if (this.selectedElement < this.nearest.vors.length - 1) {
                this.clickOnElement(this.selectedElement + 1);
                this.scrollElement.scrollDown(true);
            }
        }
        else {
            this.scrollElement.scrollDown();
        }
    }
    clickOnFrequency(_index) {
        let infos = this.nearest.vors[_index];
        let context = {
            homePageGroup: "MFD",
            homePageParent: "MFD Home",
            frequencyText: infos.frequencyMHz.toFixed(2) + " " + infos.ident,
            frequency: infos.frequencyBCD16,
            isNav: true
        };
        this.gps.loadFrequencyWindow.element.setContext(context);
        this.gps.switchToPopUpPage(this.gps.loadFrequencyWindow);
    }
}
class AS3000_TSC_NRST_NDB extends NavSystemTouch_NRST_NDB {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, false);
        this.gps.deactivateNavButton(2, false);
        this.gps.deactivateNavButton(5, false);
        this.gps.deactivateNavButton(6, false);
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        if (this.selectedElement != -1) {
            if (this.selectedElement > 0) {
                this.clickOnElement(this.selectedElement - 1);
                this.scrollElement.scrollUp(true);
            }
        }
        else {
            this.scrollElement.scrollUp();
        }
    }
    scrollDown() {
        if (this.selectedElement != -1) {
            if (this.selectedElement < this.nearest.ndbs.length - 1) {
                this.clickOnElement(this.selectedElement + 1);
                this.scrollElement.scrollDown(true);
            }
        }
        else {
            this.scrollElement.scrollDown();
        }
    }
}
class AS3000_TSC_NavComHome extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.xpdrState = -1;
        this.selectedCom = 1;
        this.inputIndex = -1;
        this.identTime = 0;
    }
    init(root) {
        this.XPDRIdent = this.gps.getChildById("XPDRIdent");
        this.Com1Active = this.gps.getChildById("Com1Active");
        this.Com1Active_Freq = this.Com1Active.getElementsByClassName("mainNumber")[0];
        this.Com1Stby = this.gps.getChildById("Com1Stby");
        this.Com1Stby_Freq = this.Com1Stby.getElementsByClassName("mainNumber")[0];
        this.Com2Active = this.gps.getChildById("Com2Active");
        this.Com2Active_Freq = this.Com2Active.getElementsByClassName("mainNumber")[0];
        this.Com2Stby = this.gps.getChildById("Com2Stby");
        this.Com2Stby_Freq = this.Com2Stby.getElementsByClassName("mainNumber")[0];
        this.XPDR = this.gps.getChildById("XPDR");
        this.XPDRStatus = this.XPDR.getElementsByClassName("topText")[0];
        this.XPDRCode = this.XPDR.getElementsByClassName("mainNumber")[0];
        this.PilotIsolate = this.gps.getChildById("PilotIsolate");
        this.Mic_Button = this.gps.getChildById("Mic");
        this.Mon_Button = this.gps.getChildById("Mon");
        this.Mic_Com1_Status = this.gps.getChildById("Com1_MicActive");
        this.Mic_Com2_Status = this.gps.getChildById("Com2_MicActive");
        this.Mon_Com1_Status = this.gps.getChildById("Com1_MonActive");
        this.Mon_Com2_Status = this.gps.getChildById("Com2_MonActive");
        this.PilotMusic = this.gps.getChildById("PilotMusic");
        this.AudioRadio = this.gps.getChildById("AudioRadio");
        this.Intercom = this.gps.getChildById("Intercom");
        this.NKFindButton = this.gps.getChildById("NKFindButton");
        this.NKBkspButton = this.gps.getChildById("NKBkspButton");
        this.NK_1 = this.gps.getChildById("NK_1");
        this.NK_2 = this.gps.getChildById("NK_2");
        this.NK_3 = this.gps.getChildById("NK_3");
        this.NK_4 = this.gps.getChildById("NK_4");
        this.NK_5 = this.gps.getChildById("NK_5");
        this.NK_6 = this.gps.getChildById("NK_6");
        this.NK_7 = this.gps.getChildById("NK_7");
        this.NK_8 = this.gps.getChildById("NK_8");
        this.NK_9 = this.gps.getChildById("NK_9");
        this.NKPlayButton = this.gps.getChildById("NKPlayButton");
        this.NK_0 = this.gps.getChildById("NK_0");
        this.NKXferButton = this.gps.getChildById("NKXferButton");
        this.gps.makeButton(this.Com1Stby, this.setSelectedCom.bind(this, 1));
        this.gps.makeButton(this.Com2Stby, this.setSelectedCom.bind(this, 2));
        this.gps.makeButton(this.Com1Active, this.swapCom1.bind(this));
        this.gps.makeButton(this.Com2Active, this.swapCom2.bind(this));
        this.gps.makeButton(this.NK_0, this.onDigitPress.bind(this, 0));
        this.gps.makeButton(this.NK_1, this.onDigitPress.bind(this, 1));
        this.gps.makeButton(this.NK_2, this.onDigitPress.bind(this, 2));
        this.gps.makeButton(this.NK_3, this.onDigitPress.bind(this, 3));
        this.gps.makeButton(this.NK_4, this.onDigitPress.bind(this, 4));
        this.gps.makeButton(this.NK_5, this.onDigitPress.bind(this, 5));
        this.gps.makeButton(this.NK_6, this.onDigitPress.bind(this, 6));
        this.gps.makeButton(this.NK_7, this.onDigitPress.bind(this, 7));
        this.gps.makeButton(this.NK_8, this.onDigitPress.bind(this, 8));
        this.gps.makeButton(this.NK_9, this.onDigitPress.bind(this, 9));
        this.gps.makeButton(this.NKBkspButton, this.backspace.bind(this));
        this.gps.makeButton(this.NKXferButton, this.swapSelectedCom.bind(this));
        this.gps.makeButton(this.XPDR, this.openTransponder.bind(this));
        this.gps.makeButton(this.XPDRIdent, this.xpdrIdent.bind(this));
        this.gps.makeButton(this.AudioRadio, this.openAudioRadios.bind(this));
        this.gps.makeButton(this.Mic_Button, this.MicSwitch.bind(this));
        this.gps.makeButton(this.Mon_Button, this.MonSwitch.bind(this));
    }
    onEnter() {
        this.setSoftkeysNames();
    }
    onUpdate(_deltaTime) {
        let com1Active = this.gps.frequencyFormat(SimVar.GetSimVarValue("COM ACTIVE FREQUENCY:1", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum") == 0 ? 2 : 3);
        let com1Stby;
        if (this.selectedCom != 1 || this.inputIndex == -1) {
            com1Stby = this.gps.frequencyFormat(SimVar.GetSimVarValue("COM STANDBY FREQUENCY:1", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum") == 0 ? 2 : 3);
        }
        else {
            let state = this.gps.blinkGetState(1000, 500) ? "Blink" : "Off";
            var regex = new RegExp('^(.{' + (this.inputIndex > 2 ? this.inputIndex + 1 : this.inputIndex) + '})(.)(.*)');
            var replace = '<span class="Writed">$1</span><span class="Writing" state="' + state + '">$2</span><span class = "ToWrite">$3</span>';
            com1Stby = ((this.currentInput / 1000).toFixed(SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum") == 0 ? 2 : 3) + " ").replace(regex, replace);
        }
        let com2Active = this.gps.frequencyFormat(SimVar.GetSimVarValue("COM ACTIVE FREQUENCY:2", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum") == 0 ? 2 : 3);
        let com2Stby;
        if (this.selectedCom != 2 || this.inputIndex == -1) {
            com2Stby = this.gps.frequencyFormat(SimVar.GetSimVarValue("COM STANDBY FREQUENCY:2", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum") == 0 ? 2 : 3);
        }
        else {
            let state = this.gps.blinkGetState(1000, 500) ? "Blink" : "Off";
            var regex = new RegExp('^(.{' + (this.inputIndex > 2 ? this.inputIndex + 1 : this.inputIndex) + '})(.)(.*)');
            var replace = '<span class="Writed">$1</span><span class="Writing" state="' + state + '">$2</span><span class = "ToWrite">$3</span>';
            com2Stby = ((this.currentInput / 1000).toFixed(SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum") == 0 ? 2 : 3) + " ").replace(regex, replace);
        }
        if (this.Com1Active_Freq.innerHTML != com1Active) {
            this.Com1Active_Freq.innerHTML = com1Active;
        }
        if (this.Com1Stby_Freq.innerHTML != com1Stby) {
            this.Com1Stby_Freq.innerHTML = com1Stby;
        }
        if (this.Com2Active_Freq.innerHTML != com2Active) {
            this.Com2Active_Freq.innerHTML = com2Active;
        }
        if (this.Com2Stby_Freq.innerHTML != com2Stby) {
            this.Com2Stby_Freq.innerHTML = com2Stby;
        }
        if (this.selectedCom == 1) {
            this.Com1Stby.setAttribute("state", "Selected");
            this.Com2Stby.setAttribute("state", "none");
        }
        else if (this.selectedCom == 2) {
            this.Com1Stby.setAttribute("state", "none");
            this.Com2Stby.setAttribute("state", "Selected");
        }
        let xpdrState = SimVar.GetSimVarValue("TRANSPONDER STATE:1", "number");
        if (this.xpdrState != xpdrState) {
            this.xpdrState = xpdrState;
            switch (xpdrState) {
                case 0:
                    this.XPDRStatus.innerHTML = "Off";
                    this.XPDR.setAttribute("state", "");
                    break;
                case 1:
                    this.XPDRStatus.innerHTML = "STBY";
                    this.XPDR.setAttribute("state", "");
                    break;
                case 2:
                    this.XPDRStatus.innerHTML = "TEST";
                    this.XPDR.setAttribute("state", "");
                    break;
                case 3:
                    this.XPDRStatus.innerHTML = "ON";
                    this.XPDR.setAttribute("state", "Green");
                    break;
                case 4:
                    this.XPDRStatus.innerHTML = "ALT";
                    this.XPDR.setAttribute("state", "Green");
                    break;
            }
        }
        let transponderCode = ("0000" + SimVar.GetSimVarValue("TRANSPONDER CODE:1", "number")).slice(-4);
        if (transponderCode != this.XPDRCode.innerHTML) {
            this.XPDRCode.innerHTML = transponderCode;
        }
        let comSpacingMode = SimVar.GetSimVarValue("COM SPACING MODE:" + this.selectedCom, "Enum");
        if (comSpacingMode == 0 && this.currentInput % 25 != 0) {
            this.currentInput -= this.currentInput % 25;
        }
        if (comSpacingMode == 0 && this.inputIndex > 5) {
            this.inputIndex = 5;
        }
        if (this.identTime > 0) {
            this.identTime -= this.gps.deltaTime;
            Avionics.Utils.diffAndSetAttribute(this.XPDRIdent, "state", "Active");
        }
        else {
            Avionics.Utils.diffAndSetAttribute(this.XPDRIdent, "state", "");
        }
        Avionics.Utils.diffAndSetAttribute(this.Mic_Com1_Status, "visibility", SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") ? "visible" : "hidden");
        Avionics.Utils.diffAndSetAttribute(this.Com1Active, "state", SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") ? "Active" : "");
        Avionics.Utils.diffAndSetAttribute(this.Mic_Com2_Status, "visibility", SimVar.GetSimVarValue("COM TRANSMIT:2", "Bool") ? "visible" : "hidden");
        Avionics.Utils.diffAndSetAttribute(this.Com2Active, "state", SimVar.GetSimVarValue("COM TRANSMIT:2", "Bool") ? "Active" : "");
        Avionics.Utils.diffAndSetAttribute(this.Mon_Com1_Status, "visibility", SimVar.GetSimVarValue("COM RECEIVE:1", "Bool") ? "visible" : "hidden");
        Avionics.Utils.diffAndSetAttribute(this.Mon_Com2_Status, "visibility", SimVar.GetSimVarValue("COM RECEIVE:2", "Bool") ? "visible" : "hidden");
    }
    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
        this.gps.deactivateNavButton(3);
        this.gps.deactivateNavButton(4);
        this.gps.deactivateNavButton(5);
        this.gps.deactivateNavButton(6);
    }
    onEvent(_event) {
        switch (_event) {
        }
        if (!this.gps.popUpElement) {
            switch (_event) {
                case "TopKnob_Large_INC":
                    SimVar.SetSimVarValue("K:COM" + (this.selectedCom == 1 ? "" : "2") + "_RADIO_WHOLE_INC", "Bool", 1);
                    break;
                case "TopKnob_Large_DEC":
                    SimVar.SetSimVarValue("K:COM" + (this.selectedCom == 1 ? "" : "2") + "_RADIO_WHOLE_DEC", "Bool", 1);
                    break;
                case "TopKnob_Small_INC":
                    SimVar.SetSimVarValue("K:COM" + (this.selectedCom == 1 ? "" : "2") + "_RADIO_FRACT_INC", "Bool", 1);
                    break;
                case "TopKnob_Small_DEC":
                    SimVar.SetSimVarValue("K:COM" + (this.selectedCom == 1 ? "" : "2") + "_RADIO_FRACT_DEC", "Bool", 1);
                    break;
                case "TopKnob_Push":
                    this.selectedCom == 1 ? this.setSelectedCom(2) : this.setSelectedCom(1);
                    break;
                case "TopKnob_Push_Long":
                    this.swapSelectedCom();
                    break;
                case "BottomKnob_Small_INC":
                    break;
                case "BottomKnob_Small_DEC":
                    break;
                case "BottomKnob_Push":
                    break;
            }
        }
    }
    MicSwitch() {
        SimVar.SetSimVarValue("K:PILOT_TRANSMITTER_SET", "number", SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") == 1 ? 1 : 0);
        SimVar.SetSimVarValue("K:COPILOT_TRANSMITTER_SET", "number", SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") == 1 ? 1 : 0);
    }
    MonSwitch() {
        SimVar.SetSimVarValue("K:COM" + (SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") == 1 ? 2 : 1) + "_RECEIVE_SELECT", "number", SimVar.GetSimVarValue("COM RECEIVE:" + (SimVar.GetSimVarValue("COM TRANSMIT:1", "Bool") == 1 ? 2 : 1), "Bool") == 1 ? 0 : 1);
    }
    setSelectedCom(_id) {
        if (this.inputIndex != -1) {
            this.comFreqValidate();
        }
        this.selectedCom = _id;
        this.setSoftkeysNames();
    }
    swapCom1() {
        if (this.inputIndex != -1 && this.selectedCom == 1) {
            this.comFreqValidate();
        }
        SimVar.SetSimVarValue("K:COM_STBY_RADIO_SWAP", "Boolean", 1);
    }
    swapCom2() {
        if (this.inputIndex != -1 && this.selectedCom == 2) {
            this.comFreqValidate();
        }
        SimVar.SetSimVarValue("K:COM2_RADIO_SWAP", "Boolean", 1);
    }
    swapSelectedCom() {
        if (this.selectedCom == 1) {
            this.swapCom1();
        }
        else if (this.selectedCom == 2) {
            this.swapCom2();
        }
    }
    onDigitPress(_digit) {
        switch (this.inputIndex) {
            case -1:
            case 0:
                this.gps.activateNavButton(1, "Cancel", this.comFreqCancel.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
                this.gps.activateNavButton(6, "Enter", this.comFreqValidate.bind(this), false, "ICON_TSC_BUTTONBAR_ENTER.png");
                if (_digit == 1) {
                    this.inputIndex = 1;
                    this.currentInput = 118000;
                }
                else if (_digit != 0 && _digit < 4) {
                    this.inputIndex = 2;
                    this.currentInput = 100000 + 10000 * _digit;
                }
                else {
                    this.inputIndex = 1;
                    this.currentInput = 118000;
                }
                break;
            case 1:
                if (_digit > 1 && _digit < 4) {
                    this.inputIndex = 2;
                    this.currentInput = 100000 + 10000 * _digit;
                }
                else if (_digit == 1) {
                    this.inputIndex = 2;
                    this.currentInput = 118000;
                }
                else if (_digit >= 8) {
                    this.inputIndex = 3;
                    this.currentInput = 110000 + _digit * 1000;
                }
                break;
            case 2:
                if (this.currentInput == 118000) {
                    if (_digit == 8) {
                        this.inputIndex = 3;
                    }
                    else if (_digit == 9) {
                        this.currentInput = 119000;
                        this.inputIndex = 3;
                    }
                }
                else {
                    if (!(this.currentInput == 130000 && _digit > 6)) {
                        this.currentInput += _digit * 1000;
                        this.inputIndex = 3;
                    }
                }
                break;
            case 3:
                this.currentInput += 100 * _digit;
                this.inputIndex = 4;
                break;
            case 4:
                if (SimVar.GetSimVarValue("COM SPACING MODE:" + this.selectedCom, "Enum") == 0) {
                    if (_digit == 0 || _digit == 2 || _digit == 5 || _digit == 7) {
                        this.currentInput += 10 * _digit;
                        this.inputIndex = 5;
                    }
                }
                else {
                    this.currentInput += 10 * _digit;
                    if (this.currentInput % 25 == 20) {
                        this.currentInput += 5;
                        this.inputIndex = 6;
                    }
                    else {
                        this.inputIndex = 5;
                    }
                }
                break;
            case 5:
                if (SimVar.GetSimVarValue("COM SPACING MODE:" + this.selectedCom, "Enum") == 1) {
                    let newVal = this.currentInput + _digit;
                    let test = newVal % 25;
                    if (test == 0 || test == 5 || test == 10 || test == 15) {
                        this.currentInput = newVal;
                        this.inputIndex = 6;
                    }
                }
                break;
        }
    }
    backspace() {
        if (this.inputIndex > 0) {
            this.inputIndex--;
            this.currentInput = Math.pow(10, 6 - this.inputIndex) * Math.floor(this.currentInput / Math.pow(10, 6 - this.inputIndex));
            if (this.currentInput < 118000) {
                this.currentInput = 118000;
            }
            if (this.inputIndex == 5 && this.currentInput % 25 == 20) {
                this.backspace();
            }
        }
    }
    comFreqValidate() {
        SimVar.SetSimVarValue("K:COM" + (this.selectedCom == 1 ? "" : "2") + "_STBY_RADIO_SET_HZ", "Hz", this.currentInput * 1000);
        this.comFreqCancel();
    }
    comFreqCancel() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(6);
        this.inputIndex = -1;
    }
    openTransponder() {
        if (this.inputIndex != -1) {
            this.comFreqCancel();
        }
        this.gps.transponderWindow.element.setContext("NavCom", "NAV/COM Home");
        this.gps.switchToPopUpPage(this.gps.transponderWindow);
    }
    openAudioRadios() {
        if (this.inputIndex != -1) {
            this.comFreqCancel();
        }
        this.gps.audioRadioWindow.element.setContext("NavCom", "NAV/COM Home");
        this.gps.switchToPopUpPage(this.gps.audioRadioWindow);
    }
    xpdrIdent() {
        let currMode = SimVar.GetSimVarValue("TRANSPONDER STATE:1", "number");
        if (currMode == 3 || currMode == 4) {
            this.identTime = 18000;
        }
    }
    setSoftkeysNames() {
        this.gps.setTopKnobText("COM" + this.selectedCom + " Freq<br>Push: 1-2 Hold: Swap");
        this.gps.setBottomKnobText("Pilot COM" + this.selectedCom + " Volume<br>Push: Squelch");
    }
}
class AS3000_TSC_Transponder extends NavSystemTouch_Transponder {
    setContext(_homePageParent, _homePageName) {
        this.homePageParent = _homePageParent;
        this.homePageName = _homePageName;
    }

    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Cancel", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateCode.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
        this.gps.setTopKnobText("Data Entry Push: Enter", true);
        this.gps.setBottomKnobText("", true);
    }

    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }

    onEvent(_event) {
        super.onEvent(_event);
        switch (_event) {
            case "TopKnob_Large_INC":
                if (this.inputIndex < 4) {
                    this.inputIndex++;
                }
                break;
            case "TopKnob_Large_DEC":
                if (this.inputIndex == -1) {
                    this.inputIndex = 0;
                }
                else if (this.inputIndex > 0) {
                    this.inputIndex--;
                }
                break;
            case "TopKnob_Small_INC":
                if (this.inputIndex == -1) {
                    this.inputIndex = 0;
                }
                else if (this.inputIndex < 4) {
                    this.currentInput[this.inputIndex] = (this.currentInput[this.inputIndex] + 1) % 8;
                }
                break;
            case "TopKnob_Small_DEC":
                if (this.inputIndex == -1) {
                    this.inputIndex = 0;
                }
                else if (this.inputIndex < 4) {
                    this.currentInput[this.inputIndex]--;
                    if (this.currentInput[this.inputIndex] < 0) {
                        this.currentInput[this.inputIndex] = 7;
                    }
                }
                break;
            case "TopKnob_Push":
            case "TopKnob_Push_Long":
                this.validateCode();
                break;
        }
        this.inputChanged = true;
    }

    back() {
        this.gps.goBack();
    }

    backHome() {
        this.gps.closePopUpElement();
        this.gps.SwitchToPageName(this.homePageParent, this.homePageName);
    }
}
class AS3000_TSC_AudioRadios_Line {
    constructor(_lineElement, _topKnobText, _bottomKnobText, _eventCallback) {
        this.lineElement = _lineElement;
        this.topKnobText = _topKnobText;
        this.bottomKnobText = _bottomKnobText;
        this.eventCallback = _eventCallback;
    }
}
class AS3000_TSC_AudioRadios extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.selectedLine = 0;
    }
    init(root) {
        this.window = root;
        this.pilotBody = this.gps.getChildById("AudioRadioPilotBody");
        this.lines = [];
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Nav1"), "NAV1 Freq<br>Hold: Swap", "Pilot NAV1 Volume<br>Push: ID", this.nav1EventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Nav2"), "NAV2 Freq<br>Hold: Swap", "Pilot NAV2 Volume<br>Push: ID", this.nav2EventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Com1"), "COM1 Freq<br>Push: 1-2 Hold: Swap", "Pilot COM1 Volume<br>Push: Squelch", this.com1EventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Com2"), "COM2 Freq<br>Push: 1-2 Hold: Swap", "Pilot COM2 Volume<br>Push: Squelch", this.com2EventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Speaker"), "", "Pilot Speaker Volume", this.speakerEventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Recorder"), "", "Pilot Recorder Volume", this.recorderEventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Marker"), "", "Pilot Marker Volume", this.markerEventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Adf"), "", "ADF Volume", this.adfEventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Music"), "", "Pilot Music Volume", this.musicEventCallback.bind(this)));
        this.lines.push(new AS3000_TSC_AudioRadios_Line(this.gps.getChildById("Clicks"), "", "Pilot Clicks Volume", this.clicksEventCallback.bind(this)));
        this.Nav1_Frequencies = this.gps.getChildById("Nav1_Frequencies");
        this.Nav1_Active = this.Nav1_Frequencies.getElementsByClassName("activeFreq")[0];
        this.Nav1_Stby = this.Nav1_Frequencies.getElementsByClassName("standbyFreq")[0];
        this.Nav1_ID = this.Nav1_Frequencies.getElementsByClassName("activeNavID")[0];
        this.Nav2_Frequencies = this.gps.getChildById("Nav2_Frequencies");
        this.Nav2_Active = this.Nav2_Frequencies.getElementsByClassName("activeFreq")[0];
        this.Nav2_Stby = this.Nav2_Frequencies.getElementsByClassName("standbyFreq")[0];
        this.Nav2_ID = this.Nav2_Frequencies.getElementsByClassName("activeNavID")[0];
        this.Com1_Frequencies = this.gps.getChildById("Com1_Frequencies");
        this.Com1_Active = this.Com1_Frequencies.getElementsByClassName("activeFreq")[0];
        this.Com1_Stby = this.Com1_Frequencies.getElementsByClassName("standbyFreq")[0];
        this.Com2_Frequencies = this.gps.getChildById("Com2_Frequencies");
        this.Com2_Active = this.Com2_Frequencies.getElementsByClassName("activeFreq")[0];
        this.Com2_Stby = this.Com2_Frequencies.getElementsByClassName("standbyFreq")[0];
        this.Adf_Frequencies = this.gps.getChildById("Adf_Frequencies");
        this.Adf_Active = this.Adf_Frequencies.getElementsByClassName("activeFreq")[0];
        this.Adf_Stby = this.Adf_Frequencies.getElementsByClassName("standbyFreq")[0];
        this.scrollElement = new NavSystemTouch_ScrollElement();
        this.scrollElement.elementContainer = this.pilotBody;
        this.scrollElement.elementSize = this.lines[0].lineElement.getBoundingClientRect().height;
        this.gps.makeButton(this.Nav1_Frequencies, this.openFrequencyKeyboard.bind(this, "NAV1", 108, 117.95, "NAV ACTIVE FREQUENCY:1", "NAV STANDBY FREQUENCY:1", this.setNav1Freq.bind(this), "", false));
        this.gps.makeButton(this.Nav2_Frequencies, this.openFrequencyKeyboard.bind(this, "NAV2", 108, 117.95, "NAV ACTIVE FREQUENCY:2", "NAV STANDBY FREQUENCY:2", this.setNav2Freq.bind(this), "", false));
        this.gps.makeButton(this.Com1_Frequencies, this.openFrequencyKeyboard.bind(this, "COM1 Standby", 118, 136.99, "COM ACTIVE FREQUENCY:1", "COM STANDBY FREQUENCY:1", this.setCom1Freq.bind(this), "COM SPACING MODE:1", false));
        this.gps.makeButton(this.Com2_Frequencies, this.openFrequencyKeyboard.bind(this, "COM2 Standby", 118, 136.99, "COM ACTIVE FREQUENCY:2", "COM STANDBY FREQUENCY:2", this.setCom2Freq.bind(this), "COM SPACING MODE:2", false));
        this.gps.makeButton(this.Adf_Frequencies, this.openFrequencyKeyboard.bind(this, "ADF", 190.0, 1799.5, "ADF ACTIVE FREQUENCY:1", "ADF STANDBY FREQUENCY:1", this.setAdfFreq.bind(this), "", true));
        for (let i = 0; i < this.lines.length; i++) {
            this.gps.makeButton(this.lines[i].lineElement, this.setSelectedLine.bind(this, i));
        }
    }

    setContext(_homePageParent, _homePageName) {
        this.homePageParent = _homePageParent;
        this.homePageName = _homePageName;
    }

    onEnter() {
        this.window.setAttribute("state", "Active");
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), true, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), true, "ICON_TSC_BUTTONBAR_DOWN.png");
        this.gps.setTopKnobText(this.lines[this.selectedLine].topKnobText, true);
        this.gps.setBottomKnobText(this.lines[this.selectedLine].bottomKnobText, true);
    }
    onUpdate(_deltaTime) {
        if (this.scrollElement.elementSize == 0) {
            this.scrollElement.elementSize = this.lines[0].lineElement.getBoundingClientRect().height;
        }
        this.scrollElement.update();

        Avionics.Utils.diffAndSet(this.Nav1_Active, this.gps.frequencyFormat(SimVar.GetSimVarValue("NAV ACTIVE FREQUENCY:1", "MHz"), 2));
        Avionics.Utils.diffAndSet(this.Nav1_Stby, this.gps.frequencyFormat(SimVar.GetSimVarValue("NAV STANDBY FREQUENCY:1", "MHz"), 2));
        Avionics.Utils.diffAndSet(this.Nav1_ID, SimVar.GetSimVarValue("NAV IDENT:1", "string"));
        Avionics.Utils.diffAndSet(this.Nav2_Active, this.gps.frequencyFormat(SimVar.GetSimVarValue("NAV ACTIVE FREQUENCY:2", "MHz"), 2));
        Avionics.Utils.diffAndSet(this.Nav2_Stby, this.gps.frequencyFormat(SimVar.GetSimVarValue("NAV STANDBY FREQUENCY:2", "MHz"), 2));
        Avionics.Utils.diffAndSet(this.Nav2_ID, SimVar.GetSimVarValue("NAV IDENT:2", "string"));
        Avionics.Utils.diffAndSet(this.Com1_Active, this.gps.frequencyFormat(SimVar.GetSimVarValue("COM ACTIVE FREQUENCY:1", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum") == 0 ? 2 : 3));
        Avionics.Utils.diffAndSet(this.Com1_Stby, this.gps.frequencyFormat(SimVar.GetSimVarValue("COM STANDBY FREQUENCY:1", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum") == 0 ? 2 : 3));
        Avionics.Utils.diffAndSet(this.Com2_Active, this.gps.frequencyFormat(SimVar.GetSimVarValue("COM ACTIVE FREQUENCY:2", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum") == 0 ? 2 : 3));
        Avionics.Utils.diffAndSet(this.Com2_Stby, this.gps.frequencyFormat(SimVar.GetSimVarValue("COM STANDBY FREQUENCY:2", "MHz"), SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum") == 0 ? 2 : 3));
        Avionics.Utils.diffAndSet(this.Adf_Active, this.gps.frequencyFormat(SimVar.GetSimVarValue("ADF ACTIVE FREQUENCY:1", "KHz"), 1));
        Avionics.Utils.diffAndSet(this.Adf_Stby, this.gps.frequencyFormat(SimVar.GetSimVarValue("ADF STANDBY FREQUENCY:1", "KHz"), 1));
    }
    onExit() {
        this.window.setAttribute("state", "Inactive");
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(5, true);
        this.gps.deactivateNavButton(6, true);
    }
    onEvent(_event) {
        this.lines[this.selectedLine].eventCallback(_event);
    }

    scrollUp() {
        this.scrollElement.scrollUp();
    }
    scrollDown() {
        this.scrollElement.scrollDown();
    }
    openFrequencyKeyboard(_title, _minFreq, _maxFreq, _activeSimVar, _StbySimVar, _endCallBack, _frequencySpacingModeSimvar, _adf) {
        this.gps.frequencyKeyboard.element.setContext(_title, _minFreq, _maxFreq, _activeSimVar, _StbySimVar, _endCallBack, this.homePageParent, this.homePageName, _frequencySpacingModeSimvar, _adf);
        this.gps.switchToPopUpPage(this.gps.frequencyKeyboard);
    }

    setNav1Freq(_newFreq, swap) {
        SimVar.SetSimVarValue("K:NAV1_STBY_SET_HZ", "Hz", _newFreq);
        if (swap) {
            SimVar.SetSimVarValue("K:NAV1_RADIO_SWAP", "Bool", 1);
        }
    }
    setNav2Freq(_newFreq, swap) {
        SimVar.SetSimVarValue("K:NAV2_STBY_SET_HZ", "Hz", _newFreq);
        if (swap) {
            SimVar.SetSimVarValue("K:NAV2_RADIO_SWAP", "Bool", 1);
        }
    }
    setCom1Freq(_newFreq, swap) {
        SimVar.SetSimVarValue("K:COM_STBY_RADIO_SET_HZ", "Hz", _newFreq);
        if (swap) {
            SimVar.SetSimVarValue("K:COM_STBY_RADIO_SWAP", "Bool", 1);
        }
    }
    setCom2Freq(_newFreq, swap) {
        SimVar.SetSimVarValue("K:COM2_STBY_RADIO_SET_HZ", "Hz", _newFreq);
        if (swap) {
            SimVar.SetSimVarValue("K:COM2_RADIO_SWAP", "Bool", 1);
        }
    }
    setAdfFreq(_newFreq, swap) {
        SimVar.SetSimVarValue("K:ADF1_RADIO_SWAP", "Boolean", 0);
        SimVar.SetSimVarValue("K:ADF_COMPLETE_SET", "Frequency ADF BCD32", Avionics.Utils.make_adf_bcd32(_newFreq * 1000));
        if (!swap) {
            SimVar.SetSimVarValue("K:ADF1_RADIO_SWAP", "Boolean", 0);
        }
    }
    setSelectedLine(_index) {
        this.lines[this.selectedLine].lineElement.setAttribute("state", "");
        this.selectedLine = _index;
        this.lines[this.selectedLine].lineElement.setAttribute("state", "Selected");
        this.gps.setTopKnobText(this.lines[this.selectedLine].topKnobText, true);
        this.gps.setBottomKnobText(this.lines[this.selectedLine].bottomKnobText, true);
    }
    nav1EventCallback(_event) {
        switch (_event) {
            case "TopKnob_Large_INC":
                SimVar.SetSimVarValue("K:NAV1_RADIO_WHOLE_INC", "Bool", 1);
                break;
            case "TopKnob_Large_DEC":
                SimVar.SetSimVarValue("K:NAV1_RADIO_WHOLE_DEC", "Bool", 1);
                break;
            case "TopKnob_Small_INC":
                SimVar.SetSimVarValue("K:NAV1_RADIO_FRACT_INC", "Bool", 1);
                break;
            case "TopKnob_Small_DEC":
                SimVar.SetSimVarValue("K:NAV1_RADIO_FRACT_DEC", "Bool", 1);
                break;
            case "TopKnob_Push":
                break;
            case "TopKnob_Push_Long":
                SimVar.SetSimVarValue("K:NAV1_RADIO_SWAP", "Bool", 1);
                break;
            case "BottomKnob_Small_INC":
                break;
            case "BottomKnob_Small_DEC":
                break;
            case "BottomKnob_Push":
                break;
        }
    }
    nav2EventCallback(_event) {
        switch (_event) {
            case "TopKnob_Large_INC":
                SimVar.SetSimVarValue("K:NAV2_RADIO_WHOLE_INC", "Bool", 1);
                break;
            case "TopKnob_Large_DEC":
                SimVar.SetSimVarValue("K:NAV2_RADIO_WHOLE_DEC", "Bool", 1);
                break;
            case "TopKnob_Small_INC":
                SimVar.SetSimVarValue("K:NAV2_RADIO_FRACT_INC", "Bool", 1);
                break;
            case "TopKnob_Small_DEC":
                SimVar.SetSimVarValue("K:NAV2_RADIO_FRACT_DEC", "Bool", 1);
                break;
            case "TopKnob_Push":
                break;
            case "TopKnob_Push_Long":
                SimVar.SetSimVarValue("K:NAV2_RADIO_SWAP", "Bool", 1);
                break;
            case "BottomKnob_Small_INC":
                break;
            case "BottomKnob_Small_DEC":
                break;
            case "BottomKnob_Push":
                break;
        }
    }
    com1EventCallback(_event) {
        switch (_event) {
            case "TopKnob_Large_INC":
                SimVar.SetSimVarValue("K:COM_RADIO_WHOLE_INC", "Bool", 1);
                break;
            case "TopKnob_Large_DEC":
                SimVar.SetSimVarValue("K:COM_RADIO_WHOLE_DEC", "Bool", 1);
                break;
            case "TopKnob_Small_INC":
                SimVar.SetSimVarValue("K:COM_RADIO_FRACT_INC", "Bool", 1);
                break;
            case "TopKnob_Small_DEC":
                SimVar.SetSimVarValue("K:COM_RADIO_FRACT_DEC", "Bool", 1);
                break;
            case "TopKnob_Push":
                this.setSelectedLine(3);
                break;
            case "TopKnob_Push_Long":
                SimVar.SetSimVarValue("K:COM_STBY_RADIO_SWAP", "Bool", 1);
                break;
            case "BottomKnob_Small_INC":
                break;
            case "BottomKnob_Small_DEC":
                break;
            case "BottomKnob_Push":
                break;
        }
    }
    com2EventCallback(_event) {
        switch (_event) {
            case "TopKnob_Large_INC":
                SimVar.SetSimVarValue("K:COM2_RADIO_WHOLE_INC", "Bool", 1);
                break;
            case "TopKnob_Large_DEC":
                SimVar.SetSimVarValue("K:COM2_RADIO_WHOLE_DEC", "Bool", 1);
                break;
            case "TopKnob_Small_INC":
                SimVar.SetSimVarValue("K:COM2_RADIO_FRACT_INC", "Bool", 1);
                break;
            case "TopKnob_Small_DEC":
                SimVar.SetSimVarValue("K:COM2_RADIO_FRACT_DEC", "Bool", 1);
                break;
            case "TopKnob_Push":
                this.setSelectedLine(2);
                break;
            case "TopKnob_Push_Long":
                SimVar.SetSimVarValue("K:COM2_RADIO_SWAP", "Bool", 1);
                break;
            case "BottomKnob_Small_INC":
                break;
            case "BottomKnob_Small_DEC":
                break;
            case "BottomKnob_Push":
                break;
        }
    }
    speakerEventCallback(_event) {
    }
    recorderEventCallback(_event) {
    }
    markerEventCallback(_event) {
    }
    adfEventCallback(_event) {
    }
    musicEventCallback(_event) {
    }
    clicksEventCallback(_event) {
    }

    back() {
        this.gps.goBack();
    }

    backHome() {
        this.gps.closePopUpElement();
        this.gps.SwitchToPageName(this.homePageParent, this.homePageName);
    }
}

class AS3000_TSC_FrequencyKeyboard extends NavSystemTouch_FrequencyKeyboard {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Cancel", this.cancelEdit.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateEdit.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
        this.gps.deactivateNavButton(5);
    }

    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }

    setContext(_title, _minFreq, _maxFreq, _activeFreqSimVar, _stbyFreqSimVar, _endCallback, _homePageParent, _homePageName, _frequencySpacingModeSimVar, _adf = false) {
        super.setContext(_title, _minFreq, _maxFreq, _activeFreqSimVar, _stbyFreqSimVar, _endCallback, "", _frequencySpacingModeSimVar);
        this.homePageParent = _homePageParent;
        this.homePageName = _homePageName;
        this.adf = _adf;
        this.unit = _adf ? "KHz" : "MHz";
        this.nbDigits = _adf ? 1 : 2;
    }

    onDigitPress(_digit) {
        if (this.adf) {
            if (this.inputIndex == -1) {
                this.inputIndex = 0;
                this.currentInput = this.minFreq;
            }
            if (this.inputIndex < 5) {
                let newInput = Math.pow(10, 4 - this.inputIndex) * Math.floor((this.currentInput + 0.001) / Math.pow(10, 4 - this.inputIndex)) + Math.pow(10, 3 - this.inputIndex) * _digit;
                if (newInput <= this.maxFreq && newInput >= this.minFreq) {
                    this.currentInput = newInput;
                    this.inputIndex++;
                }
                else if (newInput < this.minFreq && Math.pow(10, 3 - this.inputIndex) > this.minFreq - newInput) {
                    this.currentInput = this.minFreq;
                    this.inputIndex++;
                }
            }
            this.inputChanged = true;
        } else {
            super.onDigitPress(_digit);
        }
    }

    onBackSpacePress() {
        if (this.adf) {
            if (this.inputIndex > 0) {
                this.inputIndex--;
                this.currentInput = Math.pow(10, 4 - this.inputIndex) * Math.floor(this.currentInput / Math.pow(10, 4 - this.inputIndex));
                if (this.currentInput < this.minFreq) {
                    this.currentInput = this.minFreq;
                }
            }
            this.inputChanged = true;
        } else {
            super.onBackSpacePress(_digit);
        }
    }

    cancelEdit() {
        this.gps.goBack();
    }

    backHome() {
        this.gps.closePopUpElement();
        this.gps.SwitchToPageName(this.homePageParent, this.homePageName);
    }

    validateEdit() {
        let factor = this.adf ? 1 : 1000000;
        this.endCallback(this.inputIndex == -1 ? SimVar.GetSimVarValue(this.stbyFreqSimVar, this.unit) * factor : this.currentInput, false);
        this.cancelEdit();
    }

    validateAndTransferEdit() {
        let factor = this.adf ? 1 : 1000000;
        this.endCallback(this.inputIndex == -1 ? SimVar.GetSimVarValue(this.stbyFreqSimVar, this.unit) * factor: this.currentInput, true);
        this.cancelEdit();
    }
}

class AS3000_TSC_TimeKeyboard extends NavSystemTouch_TimeKeyboard {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.cancelEdit.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateEdit.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
        this.gps.deactivateNavButton(5);
    }

    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }

    setContext(_endCallback, _startingValue, _homePageParent, _homePageName) {
        super.setContext(_endCallback, null, _startingValue);
        this.homePageParent = _homePageParent;
        this.homePageName = _homePageName;
    }

    cancelEdit() {
        this.gps.goBack();
    }

    backHome() {
        this.gps.closePopUpElement();
        this.gps.SwitchToPageName(this.homePageParent, this.homePageName);
    }
}

class AS3000_TSC_SpeedKeyboard extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.digits = [0, 0, 0];
        this.isInputing = false;
        this.nbInput = 0;
        this.inputChanged = true;
    }
    init(root) {
        this.window = root;
        this.backspaceButton = this.gps.getChildById("SK_Bksp");
        this.button_0 = this.gps.getChildById("SK_0");
        this.button_1 = this.gps.getChildById("SK_1");
        this.button_2 = this.gps.getChildById("SK_2");
        this.button_3 = this.gps.getChildById("SK_3");
        this.button_4 = this.gps.getChildById("SK_4");
        this.button_5 = this.gps.getChildById("SK_5");
        this.button_6 = this.gps.getChildById("SK_6");
        this.button_7 = this.gps.getChildById("SK_7");
        this.button_8 = this.gps.getChildById("SK_8");
        this.button_9 = this.gps.getChildById("SK_9");
        this.display = this.gps.getChildById("SK_Display");
        this.gps.makeButton(this.button_0, this.onDigitPress.bind(this, 0));
        this.gps.makeButton(this.button_1, this.onDigitPress.bind(this, 1));
        this.gps.makeButton(this.button_2, this.onDigitPress.bind(this, 2));
        this.gps.makeButton(this.button_3, this.onDigitPress.bind(this, 3));
        this.gps.makeButton(this.button_4, this.onDigitPress.bind(this, 4));
        this.gps.makeButton(this.button_5, this.onDigitPress.bind(this, 5));
        this.gps.makeButton(this.button_6, this.onDigitPress.bind(this, 6));
        this.gps.makeButton(this.button_7, this.onDigitPress.bind(this, 7));
        this.gps.makeButton(this.button_8, this.onDigitPress.bind(this, 8));
        this.gps.makeButton(this.button_9, this.onDigitPress.bind(this, 9));
        this.gps.makeButton(this.backspaceButton, this.onBackSpacePress.bind(this));
    }
    setContext(_endCallback, _backPage, _startingValue) {
        this.endCallback = _endCallback;
        this.backPage = _backPage;
        this.currentInput = _startingValue;
    }
    onEnter() {
        this.window.setAttribute("state", "Active");
        this.isInputing = false;
        this.digits = [0, 0, 0];
        this.gps.activateNavButton(1, "Back", this.cancelEdit.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateEdit.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
        this.gps.deactivateNavButton(5);
    }
    onUpdate(_deltaTime) {
        if (this.isInputing) {
            if (this.inputChanged) {
                let text = "";
                for (let i = 0; i < this.digits.length - 1; i++) {
                    text += '<span class="' + (i < this.digits.length - this.nbInput ? "ToWrite" : "Writed") + '">';
                    text += this.digits[i];
                    text += '</span>';
                }
                text += '<span class="Writing">' + this.digits[this.digits.length - 1] + '</span>';
                this.inputChanged = false;
                this.display.innerHTML = text;
            }
        }
        else {
            this.display.innerHTML = (this.currentInput < 0 ? "---" : fastToFixed(this.currentInput, 0)) + "KT";
        }
    }
    onExit() {
        this.window.setAttribute("state", "Inactive");
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }
    onEvent(_event) {
    }
    onDigitPress(_digit) {
        if (!this.isInputing) {
            this.isInputing = true;
            this.nbInput = 0;
            this.digits = [0, 0, 0];
        }
        if (this.digits[0] == 0) {
            for (let i = 0; i < this.digits.length - 1; i++) {
                this.digits[i] = this.digits[i + 1];
            }
        }
        this.digits[this.digits.length - 1] = _digit;
        this.currentInput = 100 * this.digits[0] + 10 * this.digits[1] + this.digits[2];
        this.inputChanged = true;
        if (this.nbInput < this.digits.length) {
            this.nbInput++;
        }
    }
    onBackSpacePress() {
        if (!this.isInputing) {
            this.isInputing = true;
            this.nbInput = 0;
            this.digits = [0, 0, 0];
        }
        for (let i = this.digits.length - 1; i > 0; i--) {
            this.digits[i] = this.digits[i - 1];
        }
        this.digits[0] = 0;
        this.currentInput = 100 * this.digits[0] + 10 * this.digits[1] + this.digits[2];
        this.inputChanged = true;
        if (this.nbInput > 0) {
            this.nbInput--;
        }
    }
    backHome() {
        this.gps.closePopUpElement();
    }
    cancelEdit() {
        this.gps.goBack();
    }
    validateEdit() {
        this.endCallback(this.currentInput);
        this.cancelEdit();
    }
}
class AS3000_TSC_AltitudeKeyboard extends NavSystemTouch_AltitudeKeyboard {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.cancelEdit.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateEdit.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
        this.gps.deactivateNavButton(5);
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }
    cancelEdit() {
        this.gps.goBack();
    }
}
class AS3000_TSC_FullKeyboard extends NavSystemTouch_FullKeyboard {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.cancel.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validate.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }
    cancel() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.closePopUpElement();
        this.gps.SwitchToPageName("MFD", "MFD Home");
    }
    validate() {
        let nbMatched = SimVar.GetSimVarValue("C:fs9gps:IcaoSearchMatchedIcaosNumber", "number", this.gps.instrumentIdentifier);
        if (nbMatched > 1) {
            this.gps.duplicateWaypointSelection.element.setContext(this.endCallback);
            this.gps.goBack();
            this.gps.switchToPopUpPage(this.gps.duplicateWaypointSelection);
        }
        else {
            this.endCallback(SimVar.GetSimVarValue("C:fs9gps:IcaoSearchCurrentIcao", "string", this.gps.instrumentIdentifier));
            this.gps.goBack();
        }
        return true;
    }
}
class AS3000_TSC_TerrainAlert extends Warnings {
    constructor() {
        super(...arguments);
        this.lastAcknowledged = 0;
        this.lastActive = 0;
    }
    init(_root) {
        super.init(_root);
        this.window = _root;
        this.warning = this.gps.getChildById("Warning");
        this.warningContent = this.gps.getChildById("WarningContent");
        this.Warning_Ok = this.gps.getChildById("Warning_Ok");
        this.gps.makeButton(this.Warning_Ok, this.acknowledge.bind(this));
    }
    onUpdate(_deltaTime) {
        super.onUpdate(_deltaTime);
        let warningIndex = SimVar.GetSimVarValue("L:AS1000_Warnings_WarningIndex", "number");
        if (warningIndex == 0) {
            this.lastAcknowledged = 0;
            this.lastActive = 0;
        }
        if (warningIndex > 0 && this.lastAcknowledged != warningIndex && this.warnings[warningIndex - 1].level > 1) {
            if (this.lastActive != warningIndex) {
                this.window.setAttribute("state", "Active");
                this.warning.setAttribute("state", (this.warnings[warningIndex - 1].level == 2 ? "Yellow" : "Red"));
                this.warningContent.innerHTML = this.warnings[warningIndex - 1].longText;
                this.lastActive = warningIndex;
            }
        }
        else {
            if (this.window.getAttribute("state") == "Active") {
                this.window.setAttribute("state", "Inactive");
                this.lastActive = 0;
            }
        }
    }
    onEnter() {
    }
    onExit() {
    }
    onEvent(_event) {
    }
    acknowledge() {
        this.lastAcknowledged = SimVar.GetSimVarValue("L:AS1000_Warnings_WarningIndex", "number");
    }
}
class AS3000_TSC_WaypointButtonElement {
    constructor() {
        this.base = window.document.createElement("div");
        this.base.setAttribute("class", "line");
        {
            this.button = window.document.createElement("div");
            this.button.setAttribute("class", "gradientButton");
            {
                this.ident = window.document.createElement("div");
                this.ident.setAttribute("class", "mainValue");
                this.button.appendChild(this.ident);
                this.name = window.document.createElement("div");
                this.name.setAttribute("class", "title");
                this.button.appendChild(this.name);
                this.symbol = window.document.createElement("img");
                this.symbol.setAttribute("class", "symbol");
                this.button.appendChild(this.symbol);
            }
            this.base.appendChild(this.button);
        }
    }
}
class AS3000_TSC_InsertBeforeWaypoint extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.elements = [];
    }
    init(root) {
        this.window = root;
        this.tableContainer = root.getElementsByClassName("Container")[0];
        this.table = this.tableContainer.getElementsByClassName("WayPoints")[0];
        this.endButtonLine = this.table.getElementsByClassName("EndButtonLine")[0];
        this.endButton = this.gps.getChildById("EndButton");
        this.scrollElement = new NavSystemTouch_ScrollElement();
        this.scrollElement.elementContainer = this.tableContainer;
        this.scrollElement.elementSize = (this.elements.length > 0 ? this.elements[1].base.getBoundingClientRect().height : 0);
        this.gps.makeButton(this.endButton, this.endButtonClick.bind(this));
    }
    onEnter() {
        this.gps.currFlightPlanManager.updateFlightPlan();
        this.window.setAttribute("state", "Active");
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onUpdate(_deltaTime) {
        if (this.scrollElement.elementSize == 0) {
            this.scrollElement.elementSize = (this.elements.length > 0 ? this.elements[1].base.getBoundingClientRect().height : 0);
        }
        this.scrollElement.update();
        for (let i = 0; i < this.gps.currFlightPlanManager.getWaypointsCount(); i++) {
            if (this.elements.length < i + 1) {
                let newElem = new AS3000_TSC_WaypointButtonElement();
                this.gps.makeButton(newElem.button, this.elementClick.bind(this, i));
                this.table.insertBefore(newElem.base, this.endButtonLine);
                this.elements.push(newElem);
            }
            let infos = this.gps.currFlightPlanManager.getWaypoint(i).infos;
            Avionics.Utils.diffAndSet(this.elements[i].ident, infos.ident);
            Avionics.Utils.diffAndSet(this.elements[i].name, infos.name);
            let symbol = infos.imageFileName();
            Avionics.Utils.diffAndSetAttribute(this.elements[i].symbol, "src", symbol != "" ? "/Pages/VCockpit/Instruments/Shared/Map/Images/" + symbol : "");
        }
        for (let i = this.gps.currFlightPlanManager.getWaypointsCount(); i < this.elements.length; i++) {
            Avionics.Utils.diffAndSetAttribute(this.elements[i].base, "state", "Inactive");
        }
    }
    onExit() {
        this.window.setAttribute("state", "Inactive");
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(4, true);
        this.gps.deactivateNavButton(6, true);
    }
    onEvent(_event) {
    }
    setContext(_endCallback) {
        this.endCallback = _endCallback;
    }
    elementClick(_index) {
        if (this.endCallback) {
            this.endCallback(_index);
        }
        this.gps.goBack();
    }
    endButtonClick() {
        this.elementClick(this.elements.length);
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        this.scrollElement.scrollUp();
    }
    scrollDown() {
        this.scrollElement.scrollDown();
    }
}
class AS3000_TSC_DuplicateWaypointSelection extends NavSystemTouch_DuplicateWaypointSelection {
    onEnter() {
        super.onEnter();
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(5, "Up", this.scrollUp.bind(this), false, "ICON_TSC_BUTTONBAR_UP.png");
        this.gps.activateNavButton(6, "Down", this.scrollDown.bind(this), false, "ICON_TSC_BUTTONBAR_DOWN.png");
    }
    onExit() {
        super.onExit();
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(4, true);
        this.gps.deactivateNavButton(6, true);
    }
    back() {
        this.gps.goBack();
        return true;
    }
    backHome() {
        this.gps.SwitchToPageName("MFD", "MFD Home");
        this.gps.closePopUpElement();
        return true;
    }
    scrollUp() {
        this.scrollElement.scrollUp();
    }
    scrollDown() {
        this.scrollElement.scrollDown();
    }
    onButtonClick(_index) {
        super.onButtonClick(_index);
        this.gps.goBack();
    }
}
class AS3000_TSC_Minimums extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.currentMode = 0;
        this.digits = [0, 0, 0, 0, 0];
        this.isEditing = false;
    }
    init(root) {
        this.typeButton = this.gps.getChildById("min_typeButton");
        this.typeButtonValue = this.typeButton.getElementsByClassName("lowerValue")[0];
        this.tempAtDestButton = this.gps.getChildById("min_tempAtDestButton");
        this.tempAtDestButtonValue = this.tempAtDestButton.getElementsByClassName("lowerValue")[0];
        this.display = this.gps.getChildById("min_Display");
        this.min_1 = this.gps.getChildById("min_1");
        this.min_2 = this.gps.getChildById("min_2");
        this.min_3 = this.gps.getChildById("min_3");
        this.min_4 = this.gps.getChildById("min_4");
        this.min_5 = this.gps.getChildById("min_5");
        this.min_6 = this.gps.getChildById("min_6");
        this.min_7 = this.gps.getChildById("min_7");
        this.min_8 = this.gps.getChildById("min_8");
        this.min_9 = this.gps.getChildById("min_9");
        this.min_0 = this.gps.getChildById("min_0");
        this.min_Bksp = this.gps.getChildById("min_Bksp");
        this.setMode(0);
        this.gps.makeButton(this.typeButton, this.openMinimumSourceSelection.bind(this));
        this.gps.makeButton(this.min_1, this.onDigitPress.bind(this, 1));
        this.gps.makeButton(this.min_2, this.onDigitPress.bind(this, 2));
        this.gps.makeButton(this.min_3, this.onDigitPress.bind(this, 3));
        this.gps.makeButton(this.min_4, this.onDigitPress.bind(this, 4));
        this.gps.makeButton(this.min_5, this.onDigitPress.bind(this, 5));
        this.gps.makeButton(this.min_6, this.onDigitPress.bind(this, 6));
        this.gps.makeButton(this.min_7, this.onDigitPress.bind(this, 7));
        this.gps.makeButton(this.min_8, this.onDigitPress.bind(this, 8));
        this.gps.makeButton(this.min_9, this.onDigitPress.bind(this, 9));
        this.gps.makeButton(this.min_0, this.onDigitPress.bind(this, 0));
        this.gps.makeButton(this.min_Bksp, this.onBkspPress.bind(this));
    }
    onEnter() {
        this.isEditing = false;
        this.gps.activateNavButton(1, "Back", this.cancelEdit.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
        this.gps.activateNavButton(6, "Enter", this.validateEdit.bind(this), true, "ICON_TSC_BUTTONBAR_ENTER.png");
    }
    onUpdate(_deltaTime) {
        if (this.isEditing) {
            let display = '<span class="ToWrite">';
            let zerosEnded = false;
            for (let i = 0; i < this.digits.length - 1; i++) {
                if (this.digits[i] != 0 && !zerosEnded) {
                    display += '</span><span class="Writed">';
                    zerosEnded = true;
                }
                display += this.digits[i].toString();
            }
            display += '</span><span class="Writing">' + this.digits[this.digits.length - 1] + '</span><span class="Writed">FT</span>';
            Avionics.Utils.diffAndSet(this.display, display);
        }
        else {
            let display = '<span class="Initial">';
            display += SimVar.GetSimVarValue("L:AS3000_MinimalsValue", "number");
            Avionics.Utils.diffAndSet(this.display, display + "FT</span>");
        }
    }
    onExit() {
        this.gps.deactivateNavButton(1, true);
        this.gps.deactivateNavButton(2, true);
        this.gps.deactivateNavButton(6, true);
    }
    onEvent(_event) {
    }
    onDigitPress(_digit) {
        if (!this.isEditing) {
            this.isEditing = true;
            this.digits = [0, 0, 0, 0, 0];
        }
        if (this.digits[0] == 0) {
            for (let i = 0; i < this.digits.length - 1; i++) {
                this.digits[i] = this.digits[i + 1];
            }
        }
        this.digits[this.digits.length - 1] = _digit;
    }
    onBkspPress() {
        if (!this.isEditing) {
            this.isEditing = true;
            this.digits = [0, 0, 0, 0, 0];
        }
        for (let i = this.digits.length - 1; i > 0; i--) {
            this.digits[i] = this.digits[i - 1];
        }
        this.digits[0] = 0;
    }
    openMinimumSourceSelection() {
        this.gps.minimumSource.element.setContext(this.setMode.bind(this));
        this.gps.switchToPopUpPage(this.gps.minimumSource);
    }
    setMode(_mode) {
        this.currentMode = _mode;
        Avionics.Utils.diffAndSetAttribute(this.tempAtDestButton, "state", (_mode == 2 ? "Active" : "Inactive"));
        let newValue = "";
        switch (_mode) {
            case 0:
                newValue = "Off";
                break;
            case 1:
                newValue = "Baro";
                break;
            case 2:
                newValue = "Temp Comp";
                break;
            case 3:
                newValue = "Radio Alt";
                break;
        }
        Avionics.Utils.diffAndSet(this.typeButtonValue, newValue);
    }
    cancelEdit() {
        this.gps.goBack();
    }
    backHome() {
        this.gps.SwitchToPageName("PFD", "PFD Home");
    }
    validateEdit() {
        if (this.isEditing) {
            let value = 0;
            for (let i = 0; i < this.digits.length; i++) {
                value += this.digits[i] * Math.pow(10, this.digits.length - i - 1);
            }
            SimVar.SetSimVarValue("L:AS3000_MinimalsValue", "number", value);
        }
        SimVar.SetSimVarValue("L:AS3000_MinimalsMode", "number", this.currentMode);
        this.cancelEdit();
    }
}

class AS3000_TSC_PFDSettings extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.active = 0;
        this.aoaMode = 0;
        this.windMode = 0;
        this.comSpacingMode = 0;
    }

    init(root) {
        this.aoaButton = this.gps.getChildById("AoaButton");
        this.aoaValue = this.aoaButton.getElementsByClassName("statusText")[0];
        this.SVTButton = this.gps.getChildById("SVTButton");
        this.windButton = this.gps.getChildById("WindButton");
        this.windValue = this.windButton.getElementsByClassName("statusText")[0];
        this.comSpacingButton = this.gps.getChildById("ComSpacingButton");
        this.comSpacingValue = this.comSpacingButton.getElementsByClassName("statusText")[0];
        this.baroUnitButton = this.gps.getChildById("BaroUnitButton");
        this.baroUnitValue = this.baroUnitButton.getElementsByClassName("statusText")[0];
        //this.comSpacingSelectionMenu = this.gps.getChildById("ComSpacingSelectionMenu");
        this.gps.makeButton(this.aoaButton, this.openAoASelectWindow.bind(this));
        this.gps.makeButton(this.SVTButton, this.toggleSVT.bind(this));
        this.gps.makeButton(this.windButton, this.openWindSelectWindow.bind(this));
        this.gps.makeButton(this.baroUnitButton, this.openBaroUnitSelectWindow.bind(this));
        //this.gps.makeButton(this.comSpacingButton, this.compSpacingPress.bind(this));
        //this.gps.makeButton(this.channelSpacing25, this.channelSpacingSetMode.bind(this, 0));
        //this.gps.makeButton(this.channelSpacing833, this.channelSpacingSetMode.bind(this, 1));

        this.baroUnitText = [
            "Inches (IN)",
            "Hectopascals (HPA)"
        ];
    }

    compSpacingPress() {
        this.active = (this.active == 3 ? 0 : 3);
        this.updateDisplayedMenu();
    }

    channelSpacingSetMode(_mode) {
        if (_mode != SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum")) {
            SimVar.SetSimVarValue("K:COM_1_SPACING_MODE_SWITCH", "number", 0);
        }
        if (_mode != SimVar.GetSimVarValue("COM SPACING MODE:2", "Enum")) {
            SimVar.SetSimVarValue("K:COM_2_SPACING_MODE_SWITCH", "number", 0);
        }
        this.active = 0;
        this.updateDisplayedMenu();
    }

    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    onUpdate(_deltaTime) {
        let aoa = SimVar.GetSimVarValue("L:Glasscockpit_AOA_Mode", "number");
        let wind = SimVar.GetSimVarValue("L:Glasscockpit_Wind_Mode", "number");
        let comSpacing = SimVar.GetSimVarValue("COM SPACING MODE:1", "Enum");
        if (aoa != this.aoaMode) {
            this.aoaMode = aoa;
            switch (aoa) {
                case 0:
                    this.aoaValue.textContent = "Off";
                    break;
                case 1:
                    this.aoaValue.textContent = "On";
                    break;
                case 2:
                    this.aoaValue.textContent = "Auto";
                    break;
            }
        }

        Avionics.Utils.diffAndSetAttribute(this.SVTButton, "state", AS3000_PFD_MainPage.getSettingVar(AS3000_PFD_MainPage.VARNAME_SVT_SHOW) == 1 ? "Active" : "");

        if (wind != this.windMode) {
            this.windMode = wind;
            switch (wind) {
                case 0:
                    this.windValue.textContent = "Off";
                    break;
                case 1:
                    this.windValue.textContent = "Option 1";
                    break;
                case 2:
                    this.windValue.textContent = "Option 2";
                    break;
                case 3:
                    this.windValue.textContent = "Option 3";
                    break;
            }
        }

        if (comSpacing != this.comSpacingMode) {
            this.comSpacingMode = comSpacing;
            switch (comSpacing) {
                case 0:
                    this.comSpacingValue.textContent = "25 kHz";
                    break;
                case 1:
                    this.comSpacingValue.textContent = "8.33 kHz";
                    break;
            }
        }

        Avionics.Utils.diffAndSet(this.baroUnitValue, this.baroUnitText[AS3000_PFD_MainPage.getSettingVar(AS3000_PFD_MainPage.VARNAME_BARO_UNIT)]);
    }

    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }

    onEvent(_event) {
    }

    openAoASelectWindow() {
        //this.gps.aoaSelect.element.setContext(this.setAoAMode.bind(this), this.getAoAHighlight.bind(this), "PFD", "PFD Home");
        //this.gps.switchToPopUpPage(this.gps.aoaSelect);
    }

    setAoAMode(_val) {
        let mode = "";
        switch (_val) {
            case 0:
                mode = "On";
                break;
            case 1:
                mode = "Off";
                break;
            case 2:
                mode = "Auto";
                break;
        }
        LaunchFlowEvent("ON_MOUSERECT_HTMLEVENT", this.gps.pfdPrefix + "_AOA_" + mode);
    }

    getAoAHighlight(_val) {
        let mode = SimVar.GetSimVarValue("L:Glasscockpit_AOA_Mode", "number");
        switch (mode) {
            case 0:
                return _val == 1;
            case 1:
                return _val == 0;
            case 2:
                return _val == 2;
        }
    }

    toggleSVT() {
        AS3000_PFD_MainPage.setSettingVar(AS3000_PFD_MainPage.VARNAME_SVT_SHOW, AS3000_PFD_MainPage.getSettingVar(AS3000_PFD_MainPage.VARNAME_SVT_SHOW) ^ 1);
    }

    openWindSelectWindow() {
        //this.gps.pfdWindSelect.element.setContext(this.setWindMode.bind(this), this.getWindHighlight.bind(this), "PFD", "PFD Home");
        //this.gps.switchToPopUpPage(this.gps.pfdWindSelect);
    }

    setWindMode(_val) {
        let mode = "";
        if (_val < 3) {
            mode = `O${_val + 1}`;
        } else {
            mode = "Off";
        }
        LaunchFlowEvent("ON_MOUSERECT_HTMLEVENT", this.gps.pfdPrefix + "_Wind_" + mode);
    }

    getWindHighlight(_val) {
        let mode = SimVar.GetSimVarValue("L:Glasscockpit_Wind_Mode", "number");
        return mode == (_val + 1) % 4;
    }

    openBaroUnitSelectWindow() {
        let elementHandler = new WT_TSCStandardSelectionElementHandler(this.baroUnitText);
        let context = {
            title: "Select Baro Units",
            subclass: "standardDynamicSelectionListWindow",
            closeOnSelect: true,
            callback: this.setBaroUnit.bind(this),
            elementConstructor: elementHandler,
            elementUpdater: elementHandler,
            currentIndexGetter: new AS3000_TSC_PFDSettingIndexGetter(AS3000_PFD_MainPage.VARNAME_BARO_UNIT),
            homePageGroup: "PFD",
            homePageName: "PFD Home"
        };
        this.gps.selectionListWindow1.element.setContext(context);
        this.gps.switchToPopUpPage(this.gps.selectionListWindow1);
    }

    setBaroUnit(index) {
        AS3000_PFD_MainPage.setSettingVar(AS3000_PFD_MainPage.VARNAME_BARO_UNIT, index);
    }

    back() {
        this.gps.goBack();
        return true;
    }

    backHome() {
        this.gps.SwitchToPageName("PFD", "PFD Home");
        return true;
    }
}

class AS3000_TSC_PFDSettingIndexGetter {
    constructor(varName) {
        this.varName = varName;
    }

    getCurrentIndex() {
        return AS3000_PFD_MainPage.getSettingVar(this.varName);
    }
}

class AS3000_TSC_MinimumSource extends NavSystemElement {
    init(root) {
        this.window = root;
        this.minSource_Off = this.gps.getChildById("minSource_Off");
        this.minSource_Baro = this.gps.getChildById("minSource_Baro");
        this.minSource_TempComp = this.gps.getChildById("minSource_TempComp");
        this.minSource_RadioAlt = this.gps.getChildById("minSource_RadioAlt");
        this.gps.makeButton(this.minSource_Off, this.buttonClick.bind(this, 0));
        this.gps.makeButton(this.minSource_Baro, this.buttonClick.bind(this, 1));
        this.gps.makeButton(this.minSource_RadioAlt, this.buttonClick.bind(this, 3));
    }
    onEnter() {
        this.window.setAttribute("state", "Active");
    }
    onUpdate(_deltaTime) {
    }
    onExit() {
        this.window.setAttribute("state", "Inactive");
    }
    onEvent(_event) {
    }
    setContext(_callback) {
        this.callBack = _callback;
    }
    buttonClick(_source) {
        this.callBack(_source);
        this.gps.goBack();
    }
}
class AS3000_TSC_AirspeedReference {
    constructor(_valueButton, _statusElem, _refSpeed, _displayName) {
        this.isDisplayed = false;
        this.valueButton = _valueButton;
        this.valueElement = _valueButton.getElementsByClassName("mainValue")[0];
        this.valueSpan = _valueButton.getElementsByClassName("valueSpan")[0];
        this.unitSpan = _valueButton.getElementsByClassName("unitSpan")[0];
        this.statusElement = _statusElem;
        this.refSpeed = _refSpeed;
        this.displayedSpeed = _refSpeed;
        this.displayName = _displayName;
    }
}
class AS3000_TSC_SpeedBugs extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.references = [];
    }

    init(root) {
        let designSpeeds = Simplane.getDesignSpeeds();
        this.initAirspeedReference(this.gps.getChildById("SB_VrValue"), this.gps.getChildById("SB_VrStatus"), designSpeeds.Vr, "R");
        this.initAirspeedReference(this.gps.getChildById("SB_VxValue"), this.gps.getChildById("SB_VxStatus"), designSpeeds.Vx, "X");
        this.initAirspeedReference(this.gps.getChildById("SB_VyValue"), this.gps.getChildById("SB_VyStatus"), designSpeeds.Vy, "Y");
        this.initAirspeedReference(this.gps.getChildById("SB_VappValue"), this.gps.getChildById("SB_VappStatus"), designSpeeds.Vapp, "AP");
        this.allOnButton = this.gps.getChildById("SB_AllOn");
        this.allOffButton = this.gps.getChildById("SB_AllOff");
        this.resetButton = this.gps.getChildById("SB_RestoreDefaults");
        this.gps.makeButton(this.allOnButton, this.allOn.bind(this));
        this.gps.makeButton(this.allOffButton, this.allOff.bind(this));
        this.gps.makeButton(this.resetButton, this.restoreAll.bind(this));
        for (let i = 0; i < this.references.length; i++) {
            this.gps.makeButton(this.references[i].statusElement, this.statusClick.bind(this, i));
            this.gps.makeButton(this.references[i].valueButton, this.valueClick.bind(this, i));
        }
    }

    initAirspeedReference(_valueButton, _statusButton, _refSpeed, _name) {
        if (_valueButton && _statusButton) {
            this.references.push(new AS3000_TSC_AirspeedReference(_valueButton, _statusButton, _refSpeed == null ? -1 : _refSpeed, _name));
        }
    }

    onEnter() {
        this.gps.activateNavButton(1, "Back", this.back.bind(this), false, "ICON_TSC_BUTTONBAR_BACK.png");
        this.gps.activateNavButton(2, "Home", this.backHome.bind(this), false, "ICON_TSC_BUTTONBAR_HOME.png");
    }

    onUpdate(_deltaTime) {
        for (let i = 0; i < this.references.length; i++) {
            let isSpeedValid = this.references[i].displayedSpeed > 0;
            let displaySpeedText = isSpeedValid ? Math.round(this.references[i].displayedSpeed) : "---";
            let displayUnitText = isSpeedValid ? "KT" : "";

            Avionics.Utils.diffAndSet(this.references[i].valueSpan, displaySpeedText);
            Avionics.Utils.diffAndSet(this.references[i].unitSpan, displayUnitText);

            if (this.references[i].displayedSpeed == this.references[i].refSpeed) {
                Avionics.Utils.diffAndSetAttribute(this.references[i].valueButton, "state", "");
            } else {
                Avionics.Utils.diffAndSetAttribute(this.references[i].valueButton, "state", "Edited");
            }

            if (!isSpeedValid) {
                this.references[i].isDisplayed = false;
                Avionics.Utils.diffAndSetAttribute(this.references[i].statusElement, "state", "Greyed");
            } else {
                Avionics.Utils.diffAndSetAttribute(this.references[i].statusElement, "state", this.references[i].isDisplayed ? "Active" : "");
            }
        }
        this.updateAllOnOffButtons();
    }

    updateAllOnOffButtons() {
        let onCount = 0;
        for (let i = 0; i < this.references.length; i++) {
            if (this.references[i].isDisplayed) {
                onCount++;
            }
        }
        Avionics.Utils.diffAndSetAttribute(this.allOffButton, "state", onCount == 0 ? "Greyed" : "");
        Avionics.Utils.diffAndSetAttribute(this.allOnButton, "state", onCount == this.references.length ? "Greyed" : "");
    }

    onExit() {
        this.gps.deactivateNavButton(1);
        this.gps.deactivateNavButton(2);
    }

    onEvent(_event) {
    }

    sendToPfd() {
        let bugs = "";
        for (let i = 0; i < this.references.length; i++) {
            if (this.references[i].isDisplayed) {
                if (bugs != "") {
                    bugs += ";";
                }
                bugs += this.references[i].displayName + ":" + this.references[i].displayedSpeed;
            }
        }
        LaunchFlowEvent("ON_MOUSERECT_HTMLEVENT", this.gps.pfdPrefix + "_ElementSetAttribute", "Airspeed", "reference-bugs", bugs);
    }

    statusClick(_index) {
        if (this.references[_index].displayedSpeed > 0) {
            this.references[_index].isDisplayed = !this.references[_index].isDisplayed;
            this.sendToPfd();
        }
    }

    valueClick(_index) {
        this.gps.speedKeyboard.getElementOfType(AS3000_TSC_SpeedKeyboard).setContext(this.valueEndEditing.bind(this, _index), this.container, this.references[_index].displayedSpeed);
        this.gps.switchToPopUpPage(this.gps.speedKeyboard);
    }

    valueEndEditing(_index, _value) {
        this.references[_index].displayedSpeed = _value;
        this.sendToPfd();
    }

    allOn() {
        for (let i = 0; i < this.references.length; i++) {
            this.references[i].isDisplayed = true;
        }
        this.sendToPfd();
    }

    allOff() {
        for (let i = 0; i < this.references.length; i++) {
            this.references[i].isDisplayed = false;
        }
        this.sendToPfd();
    }

    restoreAll() {
        for (let i = 0; i < this.references.length; i++) {
            this.references[i].isDisplayed = false;
            this.references[i].displayedSpeed = this.references[i].refSpeed;
        }
        this.sendToPfd();
    }

    back() {
        this.gps.goBack();
        return true;
    }

    backHome() {
        this.back();
        return true;
    }
}
class AS3000_TSC_ConfirmationWindow extends NavSystemElement {
    init(root) {
        this.window = this.gps.getChildById("ConfirmationWindow");
        this.text = this.gps.getChildById("CW_Text");
        this.button = this.gps.getChildById("CW_Button");
        this.buttonText = this.gps.getChildById("CW_ButtonText");
        this.gps.makeButton(this.button, this.onClick.bind(this));
    }
    onEnter() {
        this.window.setAttribute("state", "Inactive");
    }
    open(_text, _buttonText = "OK") {
        this.text.innerHTML = _text;
        this.buttonText.textContent = _buttonText;
        this.window.setAttribute("state", "Active");
    }
    onUpdate(_deltaTime) {
    }
    onExit() {
    }
    onEvent(_event) {
    }
    onClick() {
        this.window.setAttribute("state", "Inactive");
    }
}
//# sourceMappingURL=AS3000_TSC_Common.js.map