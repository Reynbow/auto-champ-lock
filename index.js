/**
 * @author balaclava + fork by reynbow
 * @name auto-champ-lock
 * @link https://github.com/Reynbow/auto-champ-lock
 * @description 1 ban + role-based auto pick (top/jungle/mid/support/adc)
 */

import { request, sleep, linkEndpoint } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import { ChampionSelect, Dropdown, Checkbox, SocialSection } from "./models.js";
import {
 AutoPickSwitchAction,
 AutoBanSwitchAction,
 ForcePickSwitchAction,
 ForceBanSwitchAction,
 RefreshDropdownsAction,
 addActions
} from "./actions.js";

const championSelect = new ChampionSelect();

const autoAcceptCheckbox = new Checkbox("Accept", "controladoAutoAccept");
const pickCheckbox = new Checkbox("Pick", "controladoPick");
const banCheckbox = new Checkbox("Ban", "controladoBan");
const LOCK_IN_CONFIG_KEY = "controladoLockIn";
const LOCK_IN_TOGGLE_ID = "controlado-lock-in-toggle";

const ROLE_ICON_URLS = {
 top: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png",
 jungle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png",
 mid: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png",
 support: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png",
 adc: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png",
 ban: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-none.png"
};

const topPlayableChampionsDropdown = new Dropdown(
 "TOP",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.top,
 (config, championId) => { config.championsByRole.top = championId; },
 ROLE_ICON_URLS.top,
 "Top"
);
const junglePlayableChampionsDropdown = new Dropdown(
 "JUNGLE",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.jungle,
 (config, championId) => { config.championsByRole.jungle = championId; },
 ROLE_ICON_URLS.jungle,
 "Jungle"
);
const midPlayableChampionsDropdown = new Dropdown(
 "MIDDLE",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.mid,
 (config, championId) => { config.championsByRole.mid = championId; },
 ROLE_ICON_URLS.mid,
 "Mid"
);
const supportPlayableChampionsDropdown = new Dropdown(
 "SUPPORT",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.support,
 (config, championId) => { config.championsByRole.support = championId; },
 ROLE_ICON_URLS.support,
 "Support"
);
const adcPlayableChampionsDropdown = new Dropdown(
 "BOTTOM",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.adc,
 (config, championId) => { config.championsByRole.adc = championId; },
 ROLE_ICON_URLS.adc,
 "ADC"
);

const allChampionsBanDropdown = new Dropdown(
 "BAN",
 "controladoBan",
 getAllChampions,
 config => config.champion,
 (config, championId) => { config.champion = championId; },
 ROLE_ICON_URLS.ban,
 "Ban"
);

function getSocialContainer() {
 return document.querySelector(".lol-social-roster");
}

function getLockInConfig() {
 const config = DataStore.get(LOCK_IN_CONFIG_KEY);
 if (config && typeof config.enabled === "boolean") {
  return config;
 }
 const fallback = { enabled: true };
 DataStore.set(LOCK_IN_CONFIG_KEY, fallback);
 return fallback;
}

function setLockInEnabled(enabled) {
 const config = getLockInConfig();
 config.enabled = Boolean(enabled);
 DataStore.set(LOCK_IN_CONFIG_KEY, config);
}

function getChampSelectToggle() {
 return document.querySelector(`#${LOCK_IN_TOGGLE_ID}`);
}

function mountChampSelectLockInToggle() {
 const existing = getChampSelectToggle();
 if (existing) {
  return;
 }

 const wrapper = document.createElement("label");
 wrapper.id = LOCK_IN_TOGGLE_ID;
 wrapper.classList.add("controlado-lock-in-toggle");

 const input = document.createElement("input");
 input.type = "checkbox";
 input.checked = getLockInConfig().enabled !== false;
 input.classList.add("controlado-lock-in-native-input");

 const box = document.createElement("span");
 box.classList.add("controlado-lock-in-box");

 const text = document.createElement("span");
 text.classList.add("controlado-lock-in-text");
 text.innerText = "Lock in";

 const syncState = () => {
  wrapper.classList.toggle("is-enabled", input.checked);
  setLockInEnabled(input.checked);
 };
 input.addEventListener("change", syncState);
 syncState();

 wrapper.append(input, box, text);
 document.body.appendChild(wrapper);
}

function unmountChampSelectLockInToggle() {
 const existing = getChampSelectToggle();
 if (existing) {
  existing.remove();
 }
}

function createRoleRow(dropdownElement) {
 const row = document.createElement("div");
 row.classList.add("auto-select-role-row");

 const dropdownWrapper = document.createElement("div");
 dropdownWrapper.classList.add("auto-select-role-dropdown");
 dropdownWrapper.append(dropdownElement);

 row.append(dropdownWrapper);
 return row;
}

function injectStyles() {
 if (document.querySelector("#auto-champ-lock-style")) {
  return;
 }
 const style = document.createElement("style");
 style.id = "auto-champ-lock-style";
 style.textContent = `
.dropdown-champions-default {
 position: inherit;
 width: -webkit-fill-available;
}

.dropdown-champions-default.dropdown-drop-up::part(ui-dropdown-menu),
.dropdown-champions-default.dropdown-drop-up::part(ui-dropdown-content),
.dropdown-champions-default.dropdown-drop-up::part(ui-dropdown-options) {
 top: auto;
 bottom: 100%;
 transform-origin: bottom;
}

/* Hide right-side dropdown handles/carets from the web component parts */
.dropdown-champions-default::part(ui-dropdown-right-icon),
.dropdown-champions-default::part(ui-dropdown-arrow),
.dropdown-champions-default::part(ui-dropdown-chevron),
.dropdown-champions-default::part(ui-dropdown-handle),
.dropdown-champions-default::part(dropdown-right-icon),
.dropdown-champions-default::part(dropdown-arrow),
.dropdown-champions-default::part(dropdown-chevron),
.dropdown-champions-default::part(dropdown-handle),
.dropdown-champions-default::part(arrow),
.dropdown-champions-default::part(chevron) {
 display: none !important;
 width: 0 !important;
 min-width: 0 !important;
 opacity: 0 !important;
}

.dropdown-champions-default::part(ui-dropdown-current),
.dropdown-champions-default::part(dropdown-current) {
 padding-right: 0 !important;
 padding-top: 0 !important;
 padding-bottom: 0 !important;
 min-height: 20px !important;
 height: 20px !important;
 line-height: 1.1 !important;
}

.auto-select-checkboxes-div {
 display: flex;
 border-top: thin solid #1e282d;
}

.auto-select-checkbox {
 margin: auto;
}

.auto-select-checkbox:last-child {
 margin-right: 17px;
}

.auto-select-role-row {
 display: flex;
 align-items: center;
 min-height: 20px;
}

.auto-select-role-dropdown {
 flex: 1;
}

.controlado-lock-in-toggle {
 position: fixed;
 left: calc(50% + 247px);
 bottom: 18px;
 z-index: 9999;
 display: inline-flex;
 align-items: center;
 gap: 7px;
 height: 34px;
 padding: 0 10px;
 border: 1px solid #7b5d2c;
 box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.32);
 background: linear-gradient(180deg, #1b2734 0%, #101a25 100%);
 color: #c8aa6e;
 font-size: 12px;
 font-weight: 700;
 letter-spacing: 0.5px;
 text-transform: uppercase;
 font-family: "Beaufort for LOL", "Times New Roman", serif;
 user-select: none;
 cursor: pointer;
 transition: filter 120ms ease, border-color 120ms ease;
}

.controlado-lock-in-toggle:hover {
 border-color: #c8aa6e;
 filter: brightness(1.05);
}

.controlado-lock-in-native-input {
 position: absolute;
 opacity: 0;
 pointer-events: none;
}

.controlado-lock-in-box {
 width: 13px;
 height: 13px;
 border: 1px solid #7b5d2c;
 background: #0c151f;
 box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.2);
 position: relative;
 flex: 0 0 auto;
}

.controlado-lock-in-text {
 line-height: 1;
}

.controlado-lock-in-toggle.is-enabled .controlado-lock-in-box {
 border-color: #c8aa6e;
 box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.5);
}

.controlado-lock-in-toggle.is-enabled .controlado-lock-in-box::after {
 content: "";
 position: absolute;
 left: 3px;
 top: 0px;
 width: 4px;
 height: 8px;
 border: solid #c8aa6e;
 border-width: 0 2px 2px 0;
 transform: rotate(45deg);
}
`;
 document.head.appendChild(style);
}

async function getPlayableChampions() {
 let response = await request("GET", "/lol-champions/v1/owned-champions-minimal");

 while (!response.ok) {
  console.debug("auto-champ-lock(owned-champions-minimal): Retrying...");
  response = await request("GET", "/lol-champions/v1/owned-champions-minimal");
  await sleep(1000);
 }

 const responseData = await response.json();
 responseData.sort((a, b) => a.name.localeCompare(b.name));
 return responseData;
}

async function getAllChampions() {
 const response = await request("GET", "/lol-game-data/assets/v1/champion-summary.json");
 const responseData = await response.json();
 responseData.sort((a, b) => a.name.localeCompare(b.name));
 return responseData;
}

async function onReadyCheck() {
 if (autoAcceptCheckbox.config.enabled === true) {
  console.debug("auto-champ-lock(auto-accept): Ready check detected, accepting in 2 seconds...");
  await sleep(2000);
  await autoAccept();
 }
}

async function autoAccept() {
 const response = await request("POST", "/lol-matchmaking/v1/ready-check/accept");
 if (response.ok) {
  console.debug("auto-champ-lock(auto-accept): Accepted ready check");
 } else {
  console.error("auto-champ-lock(auto-accept): Failed to accept ready check", response);
 }
}

window.addEventListener("load", async () => {
 injectStyles();

 let socialContainer = getSocialContainer();
 while (!socialContainer) {
  await sleep(200);
  socialContainer = getSocialContainer();
 }

 const dropdownsContainer = document.createElement("div");
 const checkboxesContainer = document.createElement("div");
 checkboxesContainer.classList.add("auto-select-checkboxes-div");

 checkboxesContainer.append(autoAcceptCheckbox.element, pickCheckbox.element, banCheckbox.element);
 dropdownsContainer.append(
  createRoleRow(topPlayableChampionsDropdown.element),
  createRoleRow(junglePlayableChampionsDropdown.element),
  createRoleRow(midPlayableChampionsDropdown.element),
  createRoleRow(adcPlayableChampionsDropdown.element),
  createRoleRow(supportPlayableChampionsDropdown.element),
  createRoleRow(allChampionsBanDropdown.element)
 );

 const pluginSection = new SocialSection("Auto Champ Lock", dropdownsContainer, checkboxesContainer);
 socialContainer.append(pluginSection.element, checkboxesContainer, dropdownsContainer);

 await Promise.all([
  autoAcceptCheckbox.setup(),
  pickCheckbox.setup(),
  banCheckbox.setup(),
  topPlayableChampionsDropdown.setup(),
  junglePlayableChampionsDropdown.setup(),
  midPlayableChampionsDropdown.setup(),
  adcPlayableChampionsDropdown.setup(),
  supportPlayableChampionsDropdown.setup(),
  allChampionsBanDropdown.setup()
 ]);

 addActions([
  new AutoPickSwitchAction(() => pickCheckbox.toggle()),
  new AutoBanSwitchAction(() => banCheckbox.toggle()),
  new ForcePickSwitchAction(),
  new ForceBanSwitchAction(),
  new RefreshDropdownsAction([
   topPlayableChampionsDropdown,
   junglePlayableChampionsDropdown,
   midPlayableChampionsDropdown,
   adcPlayableChampionsDropdown,
   supportPlayableChampionsDropdown,
   allChampionsBanDropdown
  ])
 ]);

 linkEndpoint("/lol-inventory/v1/wallet", async parsedEvent => {
  if (parsedEvent.eventType === "Update") {
   console.debug("auto-champ-lock(wallet): Refreshing dropdowns...");
   await Promise.all([
    topPlayableChampionsDropdown.refresh(),
    junglePlayableChampionsDropdown.refresh(),
    midPlayableChampionsDropdown.refresh(),
    adcPlayableChampionsDropdown.refresh(),
    supportPlayableChampionsDropdown.refresh(),
    allChampionsBanDropdown.refresh()
   ]);
  }
 });

 linkEndpoint("/lol-gameflow/v1/gameflow-phase", parsedEvent => {
  if (parsedEvent.data === "ReadyCheck") {
   onReadyCheck();
  }
  if (parsedEvent.data === "ChampSelect") {
   championSelect.mount();
   mountChampSelectLockInToggle();
  } else {
   championSelect.unmount();
   unmountChampSelectLockInToggle();
  }
 });

 const phaseResponse = await request("GET", "/lol-gameflow/v1/gameflow-phase");
 if (phaseResponse.ok) {
  const phase = await phaseResponse.json();
  if (phase === "ChampSelect") {
   championSelect.mount();
   mountChampSelectLockInToggle();
  } else {
   championSelect.unmount();
   unmountChampSelectLockInToggle();
  }
 }

 console.debug("auto-champ-lock: loaded");
});
