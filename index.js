/**
 * @author balaclava + fork by reynbow
 * @name auto-champion-select-role-picks
 * @link https://github.com/controlado/auto-champion-select
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

const ROLE_ICON_URLS = {
 top: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png",
 jungle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png",
 mid: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png",
 support: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png",
 adc: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png",
 ban: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-none.png"
};

const topPlayableChampionsDropdown = new Dropdown(
 "Top pick",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.top,
 (config, championId) => { config.championsByRole.top = championId; },
 ROLE_ICON_URLS.top,
 "Top"
);
const junglePlayableChampionsDropdown = new Dropdown(
 "Jungle pick",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.jungle,
 (config, championId) => { config.championsByRole.jungle = championId; },
 ROLE_ICON_URLS.jungle,
 "Jungle"
);
const midPlayableChampionsDropdown = new Dropdown(
 "Mid pick",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.mid,
 (config, championId) => { config.championsByRole.mid = championId; },
 ROLE_ICON_URLS.mid,
 "Mid"
);
const supportPlayableChampionsDropdown = new Dropdown(
 "Support pick",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.support,
 (config, championId) => { config.championsByRole.support = championId; },
 ROLE_ICON_URLS.support,
 "Support"
);
const adcPlayableChampionsDropdown = new Dropdown(
 "ADC pick",
 "controladoPick",
 getPlayableChampions,
 config => config.championsByRole.adc,
 (config, championId) => { config.championsByRole.adc = championId; },
 ROLE_ICON_URLS.adc,
 "ADC"
);

const allChampionsBanDropdown = new Dropdown(
 "Ban",
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
 if (document.querySelector("#auto-champion-select-role-picks-style")) {
  return;
 }
 const style = document.createElement("style");
 style.id = "auto-champion-select-role-picks-style";
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
`;
 document.head.appendChild(style);
}

async function getPlayableChampions() {
 let response = await request("GET", "/lol-champions/v1/owned-champions-minimal");

 while (!response.ok) {
  console.debug("auto-champion-select-role-picks(owned-champions-minimal): Retrying...");
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
  console.debug("auto-champion-select-role-picks(auto-accept): Ready check detected, accepting in 2 seconds...");
  await sleep(2000);
  await autoAccept();
 }
}

async function autoAccept() {
 const response = await request("POST", "/lol-matchmaking/v1/ready-check/accept");
 if (response.ok) {
  console.debug("auto-champion-select-role-picks(auto-accept): Accepted ready check");
 } else {
  console.error("auto-champion-select-role-picks(auto-accept): Failed to accept ready check", response);
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

 const pluginSection = new SocialSection("Auto champion select", dropdownsContainer, checkboxesContainer);
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
   console.debug("auto-champion-select-role-picks(wallet): Refreshing dropdowns...");
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
  } else {
   championSelect.unmount();
  }
 });

 console.debug("auto-champion-select-role-picks: loaded");
});
