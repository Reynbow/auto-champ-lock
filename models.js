import { request, sleep } from "https://cdn.jsdelivr.net/npm/balaclava-utils@latest";
import defaultPluginConfig from "./config.js";

const ROLE_ORDER = ["top", "jungle", "mid", "support", "adc"];

function clone(value) {
 if (typeof structuredClone === "function") {
  return structuredClone(value);
 }
 return JSON.parse(JSON.stringify(value));
}

function getConfig(configKey) {
 const fromStore = DataStore.get(configKey);
 if (fromStore) {
  if (configKey === "controladoPick") {
   return normalizePickConfig(fromStore);
  }
  if (configKey === "controladoBan") {
   return normalizeBanConfig(fromStore);
  }
  return fromStore;
 }
 const fallback = clone(defaultPluginConfig[configKey]);
 if (configKey === "controladoPick") {
  normalizePickConfig(fallback);
 }
 if (configKey === "controladoBan") {
  normalizeBanConfig(fallback);
 }
 DataStore.set(configKey, fallback);
 return fallback;
}

function normalizePickConfig(config) {
 if (config.championsByRole) {
  return config;
 }

 const first = Array.isArray(config.champions) && config.champions[0]
  ? config.champions[0]
  : defaultPluginConfig.controladoPick.championsByRole.top;
 const second = Array.isArray(config.champions) && config.champions[1]
  ? config.champions[1]
  : first;

 config.championsByRole = {
  top: first,
  jungle: second,
  mid: first,
  support: second,
  adc: first
 };
 delete config.champions;
 DataStore.set("controladoPick", config);
 return config;
}

function normalizeBanConfig(config) {
 if (config.champion) {
  return config;
 }
 const champion = Array.isArray(config.champions) && config.champions[0]
  ? config.champions[0]
  : defaultPluginConfig.controladoBan.champion;
 config.champion = champion;
 delete config.champions;
 DataStore.set("controladoBan", config);
 return config;
}

function normalizeRole(rawRole) {
 if (!rawRole || typeof rawRole !== "string") {
  return null;
 }
 const role = rawRole.trim().toUpperCase();

 if (["TOP", "TOPLANE", "TOP_LANE", "SOLO"].includes(role)) {
  return "top";
 }
 if (["JUNGLE", "JGL", "JG"].includes(role)) {
  return "jungle";
 }
 if (["MID", "MIDDLE", "MIDLANE", "CENTER"].includes(role)) {
  return "mid";
 }
 if (["SUPPORT", "UTILITY", "SUPP", "DUO_SUPPORT"].includes(role)) {
  return "support";
 }
 if (["ADC", "BOT", "BOTTOM", "DUO_CARRY", "CARRY"].includes(role)) {
  return "adc";
 }
 return null;
}

export class ChampionSelect {
 constructor() {
  this.session = null;
  this.actions = null;

  this.localPlayerCellId = null;
  this.teamIntents = null;
  this.allPicks = null;
  this.allBans = null;

  this.mounted = false;
  this.watch();
 }

 mount() {
  this.mounted = true;
 }

 unmount() {
  this.mounted = false;
 }

 async watch() {
  while (true) {
    if (this.mounted) {
     await this.updateProperties();
     await this.task();
    }
    await sleep(300);
  }
 }

 async updateProperties() {
  const sessionResponse = await request("GET", "/lol-champ-select/v1/session");
  this.session = await sessionResponse.json();
  this.actions = this.session.actions;
  this.localPlayerCellId = this.session.localPlayerCellId;
  this.allPicks = [...this.session.myTeam, ...this.session.theirTeam];
  this.allBans = [...this.session.bans.myTeamBans, ...this.session.bans.theirTeamBans];
  this.teamIntents = this.session.myTeam.map(player => player.championPickIntent);
 }

 getLocalRole() {
  const localPlayer = this.session.myTeam.find(player => player.cellId === this.localPlayerCellId);
  if (!localPlayer) {
   return null;
  }

  const roleCandidates = [
   localPlayer.assignedPosition,
   localPlayer.position,
   localPlayer.role,
   localPlayer.teamPosition,
   localPlayer.individualPosition,
   localPlayer.selectedPosition,
   localPlayer.lane
  ];

  for (const candidate of roleCandidates) {
   const normalized = normalizeRole(candidate);
   if (normalized) {
    return normalized;
   }
  }

  return null;
 }

 getPickChampionForRole(pickConfig, role) {
  if (role && pickConfig.championsByRole?.[role]) {
   return pickConfig.championsByRole[role];
  }
  for (const roleKey of ROLE_ORDER) {
   const fallbackChampion = pickConfig.championsByRole?.[roleKey];
   if (fallbackChampion) {
    return fallbackChampion;
   }
  }
  return null;
 }

 async task() {
  const pickConfig = normalizePickConfig(getConfig("controladoPick"));
  const banConfig = normalizeBanConfig(getConfig("controladoBan"));

  if (!pickConfig.enabled && !banConfig.enabled) {
   return;
  }

  const localRole = this.getLocalRole();
  const localPlayerSubActions = this.getLocalPlayerSubActions();
  if (localPlayerSubActions.length === 0) {
   console.debug("auto-champion-select-role-picks: No local player sub actions found, skipping...");
   this.unmount();
   return;
  }

  for (const subAction of localPlayerSubActions) {
   const config = subAction.type === "pick" ? pickConfig : banConfig;
   if (!config.enabled) {
    continue;
   }

   const championIds = subAction.type === "pick"
    ? [this.getPickChampionForRole(pickConfig, localRole)]
    : [banConfig.champion];

   for (const championId of championIds) {
    if (!championId) {
     continue;
    }
    if (this.allBans.some(bannedChampionId => bannedChampionId == championId)) {
     console.debug(`auto-champion-select-role-picks: ${subAction.type} ${championId} already banned, skipping...`);
     continue;
    }
    if (subAction.type === "ban" && this.teamIntents.some(playerIntent => playerIntent == championId)) {
     if (config.force === true) {
      console.debug(`auto-champion-select-role-picks: Banning ${championId} but team intends it, forcing...`);
     } else {
      console.debug(`auto-champion-select-role-picks: Banning ${championId} but team intends it, skipping...`);
      continue;
     }
    }
    if (subAction.type === "pick" && this.allPicks.some(player => player.championId == championId)) {
     if (config.force === true) {
      console.debug(`auto-champion-select-role-picks: Picking ${championId} but already picked, forcing...`);
     } else {
      console.debug(`auto-champion-select-role-picks: Picking ${championId} but already picked, skipping...`);
      continue;
     }
    }

    console.debug(`auto-champion-select-role-picks: Trying to ${subAction.type} ${championId}${localRole ? ` for ${localRole}` : ""}...`);
    const response = await this.selectChampion(subAction.id, championId);
    if (!response.ok) {
     return;
    }
    break;
   }
  }
 }

 getLocalPlayerSubActions() {
  return this.actions.flat().filter(subAction =>
   subAction.actorCellId === this.localPlayerCellId &&
   subAction.completed === false
  ).sort(
   (a, b) => {
    const aPriority = a.type === "pick" ? 0 : 1;
    const bPriority = b.type === "pick" ? 0 : 1;
    return aPriority - bPriority;
   }
  );
 }

 selectChampion(actionId, championId) {
  const endpoint = `/lol-champ-select/v1/session/actions/${actionId}`;
  const body = { championId, completed: true };
  return request("PATCH", endpoint, { body });
 }
}

export class Dropdown {
 constructor(text, configKey, championsFunction, getSelectedChampionId, setSelectedChampionId, roleIconUrl = null, roleLabel = "") {
  this.element = document.createElement("lol-uikit-framed-dropdown");
  this.element.classList.add("dropdown-champions-default");
  this.element.classList.add("dropdown-drop-up");

  this.text = text;
  this.config = null;
  this.configKey = configKey;

  this.championsFunction = championsFunction;
  this.getSelectedChampionId = getSelectedChampionId;
  this.setSelectedChampionId = setSelectedChampionId;
  this.roleIconUrl = roleIconUrl;
  this.roleLabel = roleLabel;

  this.champions = null;
  this.setupInFlight = null;
  this.setupPending = false;
 }

 async setup() {
  this.setupPending = true;

  if (!this.setupInFlight) {
   this.setupInFlight = this.runSetupLoop();
  }

  return this.setupInFlight;
 }

 async runSetupLoop() {
  try {
   while (this.setupPending) {
    this.setupPending = false;
    await this.performSetup();
   }
  } finally {
   this.setupInFlight = null;
  }

  if (this.setupPending) {
   return this.setup();
  }
 }

 async performSetup() {
  this.champions = await this.championsFunction();
  this.config = getConfig(this.configKey);

  let selectedChampionId = null;
  try {
   selectedChampionId = this.getSelectedChampionId(this.config);
  } catch (error) {
   console.error("auto-champion-select-role-picks: Failed reading dropdown config, resetting selection", error);
  }
  if (!this.champions.some(champion => selectedChampionId === champion.id)) {
   this.setSelectedChampionId(this.config, this.champions[0].id);
   DataStore.set(this.configKey, this.config);
  }

  this.element.replaceChildren();
  const alreadyAdded = new Set();
  for (const champion of this.champions) {
   if (alreadyAdded.has(champion.name)) {
    continue;
   }
   const option = this.getNewOption(champion);
   this.element.appendChild(option);
   alreadyAdded.add(champion.name);
  }

  this.shadowRoot((root) => {
   if (!root.querySelector("#controlado-placeholder")) {
    const placeholderContainer = root.querySelector(".ui-dropdown-current");
    placeholderContainer.style = "display: flex; align-items: center; justify-content: space-between; gap: 0;";

    const placeholder = this.getNewPlaceholder();
    placeholderContainer.appendChild(placeholder);
   }
  });

  this.applyShadowStyles();
 }

 getNewOption(champion) {
  const option = document.createElement("lol-uikit-dropdown-option");
  option.setAttribute("slot", "lol-uikit-dropdown-option");
  option.addEventListener("click", () => {
   this.setSelectedChampionId(this.config, champion.id);
   DataStore.set(this.configKey, this.config);
   console.debug(this.configKey, DataStore.get(this.configKey));

   this.shadowRoot((root) => {
    const input = root.querySelector("#controlado-search");
    if (input) {
     input.value = "";
     this.filterOptions("");
    }

    const trashFilterIcon = root.querySelector(".controlado-filter-icon--trash");
    if (trashFilterIcon) {
     trashFilterIcon.classList.remove("controlado-filter-icon--trash");
    }
   });
  });

  if (this.getSelectedChampionId(this.config) === champion.id) {
   option.setAttribute("selected", "true");
  }

  option.innerText = champion.name;
  return option;
 }

 getNewPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.classList.add("controlado-tag", "controlado-tag--search");
  placeholder.id = "controlado-placeholder";

  const input = document.createElement("input");
  input.classList.add("controlado-filter-input");
  input.id = "controlado-search";
  input.type = "text";
  input.placeholder = this.text;

  const filterIcon = document.createElement("span");
  filterIcon.classList.add("controlado-filter-icon");

  filterIcon.addEventListener("click", () => {
   const filterIconIsTrash = filterIcon.classList.contains("controlado-filter-icon--trash");
   if (!filterIconIsTrash) {
    return;
   }

   input.value = "";
   this.filterOptions("");
   filterIcon.classList.toggle("controlado-filter-icon--trash", false);
  });

  input.addEventListener("input", (e) => {
   this.ensureIsOpened();
   this.filterOptions(e.target.value);
   filterIcon.classList.toggle("controlado-filter-icon--trash", Boolean(e.target.value));
  });

  ["pointerdown", "click"].forEach((type) => {
   placeholder.addEventListener(type, (e) => e.stopPropagation());
   filterIcon.addEventListener(type, (e) => e.stopPropagation());
  });

  ["pointerdown", "focusin"].forEach((type) => {
   input.addEventListener(type, (e) => e.stopPropagation(), true);
  });

  placeholder.appendChild(filterIcon);
  placeholder.appendChild(input);
  return placeholder;
 }

 filterOptions(query) {
  const options = this.element.querySelectorAll("lol-uikit-dropdown-option");
  options.forEach(option => {
   option.style.display = option.innerText.toLowerCase().includes(query.toLowerCase()) ? "" : "none";
  });
 }

 refresh() {
  return this.setup();
 }

 isOpen() {
  return this.element.classList.contains("active");
 }

 ensureIsOpened() {
  if (this.isOpen()) {
   return;
  }

  this.shadowRoot((root) => {
   const internalDropdown = root.querySelector(".ui-dropdown-current");
   if (internalDropdown) {
    internalDropdown.click();
   }
  });
 }

 shadowRoot(fn) {
  const root = this.element.shadowRoot;
  if (!root) {
   return;
  }
  fn(root);
 }

 applyShadowStyles() {
  this.shadowRoot((root) => {
   this.injectTagStyles(root);
   this.injectRoleIcon(root);
   this.removeDropdownHandleElements(root);

   const currentDropdown = root.querySelector(".ui-dropdown-current");
   if (currentDropdown) {
    currentDropdown.style.paddingRight = "8px";
   }

   const dropdownMenu = root.querySelector(".ui-dropdown-options-container");
   if (dropdownMenu) {
    dropdownMenu.style.top = "auto";
    dropdownMenu.style.bottom = "100%";
    dropdownMenu.style.transformOrigin = "bottom";
    dropdownMenu.style.transform = "translateY(0)";
   }

   const scrollableOptions = root.querySelector("lol-uikit-scrollable");
   if (scrollableOptions) {
    scrollableOptions.style.maxHeight = "250px";
   }
  });
 }

 removeDropdownHandleElements(root) {
  const selectors = [
   ".ui-dropdown-right-icon",
   ".ui-dropdown-arrow",
   ".ui-dropdown-chevron",
   ".dropdown-arrow",
   ".dropdown-chevron",
   ".dropdown-handle",
   ".arrow",
   "[part='ui-dropdown-arrow']",
   "[part='ui-dropdown-chevron']",
   "[part='ui-dropdown-right-icon']",
   "[part='ui-dropdown-handle']"
  ];

  for (const selector of selectors) {
   root.querySelectorAll(selector).forEach(element => {
    element.remove();
   });
  }

  const currentDropdown = root.querySelector(".ui-dropdown-current");
  if (!currentDropdown) {
   return;
  }

  const currentRect = currentDropdown.getBoundingClientRect();
  root.querySelectorAll("*").forEach(element => {
   if (!(element instanceof HTMLElement)) {
    return;
   }

   const className = String(element.className || "").toLowerCase();
   const id = String(element.id || "").toLowerCase();
   const part = String(element.getAttribute("part") || "").toLowerCase();
   if (id.startsWith("controlado-") || className.includes("controlado-")) {
    return;
   }

   const style = getComputedStyle(element);
   const visualHints = `${style.backgroundImage || ""} ${style.webkitMaskImage || ""}`.toLowerCase();
   const keywordHints = `${className} ${id} ${part} ${visualHints}`;
   const looksLikeIndicator = /(arrow|chevron|caret|indicator|dropdown|expand)/.test(keywordHints);
   if (!looksLikeIndicator) {
    return;
   }

   const isTiny = element.offsetWidth <= 20 && element.offsetHeight <= 20;
   if (!isTiny) {
    return;
   }

   const rect = element.getBoundingClientRect();
   const isOnRightSide = rect.left >= (currentRect.left + currentRect.width * 0.72);
   if (!isOnRightSide) {
    return;
   }

   element.remove();
  });
 }

 injectRoleIcon(root) {
  if (!this.roleIconUrl) {
   return;
  }

  const currentDropdown = root.querySelector(".ui-dropdown-current");
  if (!currentDropdown) {
   return;
  }

  let roleIcon = root.querySelector("#controlado-role-icon");
  if (!roleIcon) {
   roleIcon = document.createElement("span");
   roleIcon.id = "controlado-role-icon";
   roleIcon.classList.add("controlado-role-icon");
   currentDropdown.prepend(roleIcon);
  }

  roleIcon.style.backgroundImage = `url("${this.roleIconUrl}")`;
  roleIcon.setAttribute("title", this.roleLabel || this.text);
  roleIcon.setAttribute("aria-label", this.roleLabel || this.text);
 }

 injectTagStyles(element) {
  if (element.querySelector("style[data-controlado='dropdown-tags']")) {
   return;
  }

  const style = document.createElement("style");
  style.dataset.controlado = "dropdown-tags";
  style.textContent = `
 .controlado-filter-icon {
  cursor: default;
  display: inline-block;
  width: 12px;
  height: 12px;
  background-color: #c8aa6e;
  -webkit-mask-image: url('/fe/lol-social/search_mask.png');
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: 12px 12px;
 }

 .controlado-role-icon {
  width: 15px;
  min-width: 15px;
  height: 15px;
  margin-right: 2px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  opacity: 0.95;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.35));
 }

 .controlado-filter-icon--trash {
  cursor: pointer;
  background-color: #c86e6e;
  -webkit-mask-image: url('/fe/lol-uikit/images/icon_delete.png');
  -webkit-mask-size: 12px 12px;
 }

 .controlado-filter-input {
  color: inherit;
  background: transparent;
  border: none;
  text-align: left;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  flex: 1;
  width: 100%;
  min-width: 0;
  font-size: 11px;
 }

 .controlado-tag {
  cursor: default;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  height: 100%;
  border-radius: 0;
  border: 0;
  border-left: 1px solid rgba(200, 170, 110, 0.5);
  background: rgba(10, 18, 26, 0.45);
  color: #f3d7a5;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
  flex: 0 0 50%;
  max-width: 50%;
  min-width: 50%;
  box-sizing: border-box;
  margin: 0;
  align-self: stretch;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
 }

 .controlado-tag--search {
  border-color: rgba(215, 180, 106, 0.6);
  color: #f6e1b2;
  background: rgba(15, 23, 34, 0.55);
  text-transform: none;
  font-weight: 500;
 }

 .ui-dropdown-current {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 20px;
  padding-left: 3px;
 }

.ui-dropdown-current > *:not(#controlado-placeholder):not(#controlado-role-icon) {
  flex: 1 1 auto;
  max-width: none;
  min-width: 0;
  box-sizing: border-box;
  padding-right: calc(50% + 4px);
  margin-left: 0 !important;
  text-align: left !important;
  justify-content: flex-start !important;
  z-index: 1;
 }

 .ui-dropdown-right-icon,
 .ui-dropdown-arrow,
 .ui-dropdown-chevron,
 .dropdown-arrow,
 .dropdown-chevron,
 .dropdown-handle,
 .arrow {
  display: none !important;
 }

 .ui-dropdown-current::before,
 .ui-dropdown-current::after {
  content: none !important;
  display: none !important;
  background: none !important;
  border: 0 !important;
 }
 `;
  element.appendChild(style);
 }
}

export class Checkbox {
 constructor(text, configKey) {
  this.element = document.createElement("lol-uikit-radio-input-option");
  this.element.classList.add("lol-settings-voice-input-mode-option", "auto-select-checkbox");
  this.element.innerText = text;

  this.config = null;
  this.configKey = configKey;
 }

 setup() {
  this.config = getConfig(this.configKey);

  if (this.config.enabled) {
   this.element.setAttribute("selected", "true");
  }

  this.element.addEventListener("click", () => this.toggle());
 }

 toggle() {
  console.debug("auto-champion-select-role-picks: Toggling", this.configKey);
  this.config.enabled = !this.config.enabled;
  DataStore.set(this.configKey, this.config);
  this.element.toggleAttribute("selected");
  return this.config.enabled;
 }
}

export class SocialSection {
 constructor(label, ...hiddableElements) {
  this.element = document.createElement("lol-social-roster-group");
  this.element.addEventListener("post-render", () => this.onPostRender());
  this.element.addEventListener("click", () => this.onClick());

  this.label = label;
  this.hiddableElements = hiddableElements;

  this.waitRender();
 }

 waitRender() {
  new MutationObserver((_, observer) => {
   if (this.element.querySelector("span")) {
    this.element.dispatchEvent(new Event("post-render"));
    observer.disconnect();
   }
  }).observe(this.element, { childList: true });
 }

 onPostRender() {
  this.element.querySelector("span").innerText = this.label;
  this.element.querySelector(".group-header").removeAttribute("graggable");
 }

 onClick() {
  this.hiddableElements.forEach(element => element.classList.toggle("hidden"));
  this.element.querySelector(".arrow").toggleAttribute("open");
 }
}
