/**
 * @author balaclava + fork by reynbow
 * @name Auto Champ Lock v1.5.0
 * @link https://github.com/Reynbow/auto-champ-lock/releases
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
const FAVORITES_KEY = "controladoFavorites";

function getFavorites() {
 const arr = DataStore.get(FAVORITES_KEY);
 return Array.isArray(arr) ? arr : [];
}
function setFavorites(ids) {
 DataStore.set(FAVORITES_KEY, ids);
}
function toggleFavorite(champId) {
 const ids = getFavorites();
 const i = ids.indexOf(champId);
 if (i >= 0) ids.splice(i, 1);
 else ids.push(champId);
 setFavorites(ids);
 return ids.includes(champId);
}
const LOCK_IN_MOUNT_DELAY_MS = 1000;
let lockInMountTimeoutId = null;

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
 if (lockInMountTimeoutId) {
  clearTimeout(lockInMountTimeoutId);
  lockInMountTimeoutId = null;
 }
 const existing = getChampSelectToggle();
 if (existing) {
  existing.remove();
 }
}

function scheduleLockInMount() {
 if (lockInMountTimeoutId) {
  clearTimeout(lockInMountTimeoutId);
 }
 lockInMountTimeoutId = setTimeout(() => {
  lockInMountTimeoutId = null;
  mountChampSelectLockInToggle();
 }, LOCK_IN_MOUNT_DELAY_MS);
}

const CD_BASE = "https://raw.communitydragon.org/latest";
const DD_BASE = "https://ddragon.leagueoflegends.com/cdn/16.5.1/img/champion";
const DD_ALIAS_OVERRIDES = { Fiddlesticks: "FiddleSticks" };
function getChampionIconUrl(champion) {
 if (!champion) return null;
 const id = champion.id ?? champion.championId;
 if (id == null) return null;
 if (id < 0) return null;
 const isFiddlesticks = id === 9 || id === "9" || (champion.name && champion.name.toLowerCase() === "fiddlesticks") || champion.alias === "Fiddlesticks";
 if (isFiddlesticks) {
  const gamePath = "/lol-game-data/assets/v1/champion-icons/9.png";
  return gamePath;
 }
 if (champion.alias) {
  const ddAlias = DD_ALIAS_OVERRIDES[champion.alias] ?? champion.alias;
  return `${DD_BASE}/${ddAlias}.png`;
 }
 if (champion.squarePortraitPath) {
  return champion.squarePortraitPath;
 }
 return `${CD_BASE}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;
}

function createChampionPickerModal(champions, currentId, onSelect, options = {}) {
 const { isBan = false } = options;
 let pickerEl = null;
 let pickerBackdrop = null;

 function close() {
  if (pickerBackdrop) pickerBackdrop.classList.remove("controlado-picker-visible");
 }

 function open() {
  if (!pickerBackdrop) {
   pickerBackdrop = document.createElement("div");
   pickerBackdrop.className = "controlado-champion-picker-backdrop";
   pickerBackdrop.addEventListener("click", (e) => e.target === pickerBackdrop && close());
   document.body.appendChild(pickerBackdrop);
  }

  if (!pickerEl) {
   pickerEl = document.createElement("div");
   pickerEl.className = "controlado-champion-picker";
   pickerEl.innerHTML = `
    <div class="controlado-picker-header">
     <div class="controlado-picker-toolbar">
      <input type="text" class="controlado-picker-search" placeholder="Search champions..." />
     </div>
     <button type="button" class="controlado-picker-close" title="Close">×</button>
    </div>
    <div class="controlado-picker-grid"></div>
   `;
   pickerEl.querySelector(".controlado-picker-close").addEventListener("click", close);
   pickerBackdrop.appendChild(pickerEl);
  }

  const grid = pickerEl.querySelector(".controlado-picker-grid");
  const searchInput = pickerEl.querySelector(".controlado-picker-search");

  function renderChampions(filter = "") {
   grid.innerHTML = "";
   const favs = getFavorites();
   let filtered = champions.filter(c => {
    const id = c.id ?? c.championId;
    return id != null && id > 0 && c.name && c.name.toLowerCase().includes(filter.toLowerCase());
   });
   filtered.sort((a, b) => {
    const aId = a.id ?? a.championId;
    const bId = b.id ?? b.championId;
    const aFav = favs.indexOf(aId) >= 0;
    const bFav = favs.indexOf(bId) >= 0;
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return a.name.localeCompare(b.name);
   });

   const randomEl = document.createElement("div");
   randomEl.className = "controlado-picker-champ" + (currentId === -1 ? " selected" : "");
   randomEl.innerHTML = `
    <div class="controlado-picker-champ-portrait controlado-picker-random"></div>
    <span class="controlado-picker-champ-name">Random</span>
   `;
   randomEl.addEventListener("click", () => {
    onSelect(-1);
    close();
   });
   grid.appendChild(randomEl);

   for (const champ of filtered) {
    const champId = champ.id ?? champ.championId;
    const isFav = favs.indexOf(champId) >= 0;
    const champEl = document.createElement("div");
    champEl.className = "controlado-picker-champ" + (currentId == champId ? " selected" : "");
    const portraitWrap = document.createElement("div");
    portraitWrap.className = "controlado-picker-champ-portrait-wrap";
    const portraitDiv = document.createElement("div");
    portraitDiv.className = "controlado-picker-champ-portrait";
    portraitDiv.style.backgroundImage = `url('${getChampionIconUrl(champ) || ""}')`;
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "controlado-picker-star" + (isFav ? " is-starred" : "");
    starBtn.title = isFav ? "Unfavourite" : "Favourite";
    const starPath = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
    starBtn.innerHTML = isFav
     ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${starPath}"/></svg>`
     : `<svg viewBox="0 0 24 24" fill="none"><path class="controlado-star-outline-stroke" d="${starPath}"/><path class="controlado-star-outline-inner" d="${starPath}"/></svg>`;
    starBtn.addEventListener("click", (e) => {
     e.stopPropagation();
     toggleFavorite(champId);
     renderChampions(searchInput.value);
    });
    portraitWrap.append(portraitDiv, starBtn);
    const nameSpan = document.createElement("span");
    nameSpan.className = "controlado-picker-champ-name";
    nameSpan.textContent = champ.name;
    champEl.append(portraitWrap, nameSpan);
    champEl.addEventListener("click", (e) => {
     if (e.target.closest(".controlado-picker-star")) return;
     onSelect(champId);
     close();
    });
    grid.appendChild(champEl);
   }
  }

  searchInput.value = "";
  searchInput.addEventListener("input", () => renderChampions(searchInput.value));
  renderChampions("");

  pickerBackdrop.classList.add("controlado-picker-visible");
 }

 return { open, close };
}

function createChampLockModal() {
 let modalEl = null;
 let backdropEl = null;
 let insertAfterRef = null;
 let dropdownsRef = null;
 let pickDropdownsRef = null;
 let banDropdownRef = null;

 function close() {
  if (!modalEl || !backdropEl) return;
  const content = modalEl.querySelector(".controlado-modal-content");
  const checkboxes = content?.querySelector(".auto-select-checkboxes-div");
  if (insertAfterRef && checkboxes && dropdownsRef) {
   insertAfterRef.after(checkboxes, dropdownsRef);
   dropdownsRef.classList.remove("hidden");
  }
  [pickDropdownsRef, banDropdownRef].flat().filter(Boolean).forEach(d => d?.refresh?.());
  backdropEl.classList.remove("controlado-modal-visible");
 }

 async function open(dropdownsContainer, checkboxesContainer, insertAfterElement, { pickDropdowns, banDropdown, getPickConfig, getBanConfig, setPickChamp, setBanChamp }) {
  if (!insertAfterElement) return;

  dropdownsRef = dropdownsContainer;
  pickDropdownsRef = pickDropdowns;
  banDropdownRef = banDropdown;

  if (!backdropEl) {
   backdropEl = document.createElement("div");
   backdropEl.className = "controlado-modal-backdrop";
   backdropEl.addEventListener("click", (e) => e.target === backdropEl && close());
   document.body.appendChild(backdropEl);
  }

  if (!modalEl) {
   modalEl = document.createElement("div");
   modalEl.className = "controlado-modal controlado-modal-detailed";
   modalEl.innerHTML = `
    <div class="controlado-modal-header">
     <span class="controlado-modal-title">AUTO CHAMP LOCK</span>
     <button type="button" class="controlado-modal-close" title="Close">×</button>
    </div>
    <div class="controlado-modal-content"></div>
   `;
   modalEl.querySelector(".controlado-modal-close").addEventListener("click", close);
   backdropEl.appendChild(modalEl);
  }

  const content = modalEl.querySelector(".controlado-modal-content");
  content.innerHTML = "";
  checkboxesContainer.classList.remove("hidden");
  content.append(checkboxesContainer);

  const ROLE_ORDER = ["top", "jungle", "mid", "adc", "support"];
  const roleLabels = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };

  async function buildChampionRow(role, label, iconUrl, isBan) {
   const row = document.createElement("div");
   row.className = "controlado-modal-champ-row";
   const config = isBan ? getBanConfig() : getPickConfig();
   const championId = isBan ? config.champion : (config.championsByRole?.[role] ?? null);
   const champions = isBan ? await getAllChampions() : await getPlayableChampions();
   let champMap = champions.reduce((m, c) => { const id = c.id ?? c.championId; if (id != null) m[id] = c; return m; }, {});
   if (!isBan && championId != null && championId !== -1 && !champMap[championId]) {
    const allChamps = await getAllChampions();
    champMap = allChamps.reduce((m, c) => { const id = c.id ?? c.championId; if (id != null) m[id] = c; return m; }, champMap);
   }
   const champ = championId != null && championId !== -1 ? champMap[championId] : null;

   const portraitEl = document.createElement("div");
   portraitEl.className = "controlado-modal-champ-portrait";
   portraitEl.style.backgroundImage = champ && championId !== -1
    ? `url('${getChampionIconUrl(champ)}')`
    : "none";
   if (!champ || championId === -1) portraitEl.classList.add("controlado-modal-champ-random");

   const nameEl = document.createElement("span");
   nameEl.className = "controlado-modal-champ-name";
   nameEl.textContent = champ ? champ.name : "Random";

   const labelEl = document.createElement("span");
   labelEl.className = "controlado-modal-champ-role";
   labelEl.innerHTML = iconUrl ? `<img src="${iconUrl}" alt="" class="controlado-modal-role-icon" />` : "";
   labelEl.append(document.createTextNode(" " + label));

   const fieldWrap = document.createElement("div");
   fieldWrap.className = "controlado-modal-champ-field";
   fieldWrap.append(portraitEl, nameEl);
   fieldWrap.addEventListener("click", async () => {
    const champs = isBan ? await getAllChampions() : await getPlayableChampions();
    const picker = createChampionPickerModal(champs, championId ?? -1, async (id) => {
     if (isBan) setBanChamp(id); else setPickChamp(role, id);
     DataStore.set(isBan ? "controladoBan" : "controladoPick", isBan ? getBanConfig() : getPickConfig());
     await buildChampionRows();
     [pickDropdownsRef, banDropdownRef].flat().filter(Boolean).forEach(d => d?.refresh?.());
    }, { isBan });
    picker.open();
   });

   row.append(labelEl, fieldWrap);
   return row;
  }

  async function buildChampionRows() {
   const wrap = content.querySelector(".controlado-modal-champ-rows") || document.createElement("div");
   wrap.className = "controlado-modal-champ-rows";
   if (wrap.parentElement !== content) content.appendChild(wrap);
   wrap.innerHTML = "";

   for (const role of ROLE_ORDER) {
    wrap.appendChild(await buildChampionRow(role, roleLabels[role], ROLE_ICON_URLS[role], false));
   }
   wrap.appendChild(await buildChampionRow("ban", "Ban", ROLE_ICON_URLS.ban, true));
  }

  await buildChampionRows();

  dropdownsContainer.classList.add("hidden");
  insertAfterRef = insertAfterElement;
  dropdownsRef = dropdownsContainer;
  backdropEl.classList.add("controlado-modal-visible");
 }

 return { open, close };
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

.controlado-search-popover {
 font-family: "Beaufort for LOL", "Segoe UI", sans-serif;
 position: fixed;
 z-index: 100000;
 box-sizing: border-box;
 max-height: 280px;
 overflow-y: auto;
 overflow-x: hidden;
 background: linear-gradient(#010a13 0%, #0a1319 100%);
 border: 1px solid #a68b4a;
 border-radius: 0;
 box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
 padding: 6px;
 display: flex;
 flex-direction: column;
 gap: 0;
 opacity: 0;
 pointer-events: none;
 transition: opacity 150ms ease;
}

.controlado-search-popover.controlado-search-popover-visible {
 opacity: 1;
 pointer-events: auto;
}

.controlado-search-popover::-webkit-scrollbar {
 width: 6px;
}

.controlado-search-popover::-webkit-scrollbar-track {
 background: rgba(1, 10, 19, 0.8);
}

.controlado-search-popover::-webkit-scrollbar-thumb {
 background: linear-gradient(to bottom, #2a3542, #1a232e);
}

.controlado-search-popover-item {
 display: flex;
 align-items: center;
 gap: 6px;
 padding: 2px 6px;
 cursor: pointer;
 transition: background 100ms ease;
}

.controlado-search-popover-item:hover {
 background: rgba(200, 170, 110, 0.15);
}

.controlado-search-popover-portrait {
 width: 24px;
 height: 24px;
 flex-shrink: 0;
 background-size: cover;
 background-position: center;
 border: 1px solid rgba(200, 170, 110, 0.25);
}

.controlado-search-popover-portrait.controlado-search-popover-random {
 background: #0a1319;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 11px;
 color: #666;
}

.controlado-search-popover-portrait.controlado-search-popover-random::after {
 content: "?";
}

.controlado-search-popover-name {
 color: #e8e6e3;
 font-size: 11px;
}

.controlado-lock-in-toggle {
 position: fixed;
 right: 21px;
 bottom: 54px;
 z-index: 1;
 display: inline-flex;
 align-items: center;
 justify-content: center;
 gap: 6px;
 width: 90px;
 height: 28px;
 padding: 0 10px;
 border: 2px solid #444;
 background: #262626;
 color: #777;
 font-size: 12px;
 font-weight: 600;
 letter-spacing: 0.03em;
 text-transform: uppercase;
 font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
 user-select: none;
 cursor: pointer;
 transition: background 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

.controlado-lock-in-toggle:not(.is-enabled):hover {
 border-color: #c8aa6e;
 color: #999;
}

.controlado-lock-in-toggle:not(.is-enabled):hover .controlado-lock-in-box {
 border-color: #c8aa6e;
}

.controlado-lock-in-toggle.is-enabled {
 background: linear-gradient(#2b2e37, #2b2e37) padding-box,
  linear-gradient(to bottom, #d3b077, #916e34) border-box;
 border: 2px solid transparent;
 box-shadow: inset 0 0 0 1px #1e2028;
 color: #c7c1b0;
}

.controlado-lock-in-toggle.is-enabled::before {
 content: "";
 position: absolute;
 inset: 0;
 pointer-events: none;
 background: linear-gradient(to bottom,
  rgba(211, 176, 119, 0.18) 0%,
  rgba(211, 176, 119, 0.06) 40%,
  transparent 100%);
 opacity: 0;
 transition: opacity 180ms ease;
}

.controlado-lock-in-toggle.is-enabled:hover {
 background: linear-gradient(#2b2e37, #2b2e37) padding-box,
  linear-gradient(to bottom, #e5c890, #a67d40) border-box;
 box-shadow: inset 0 0 0 1px #1e2028,
  0 0 12px rgba(211, 176, 119, 0.25);
}

.controlado-lock-in-toggle.is-enabled:hover::before {
 opacity: 1;
}

.controlado-lock-in-toggle.is-enabled:hover .controlado-lock-in-text {
 text-shadow: 0 0 8px rgba(211, 176, 119, 0.6),
  0 0 4px rgba(211, 176, 119, 0.4);
}

.controlado-lock-in-native-input {
 position: absolute;
 opacity: 0;
 pointer-events: none;
}

.controlado-lock-in-box {
 width: 11px;
 height: 11px;
 border: 1px solid #444;
 background: #1a1a1a;
 position: relative;
 flex: 0 0 auto;
 transition: border-color 120ms ease, background 120ms ease;
}

.controlado-lock-in-toggle.is-enabled .controlado-lock-in-box {
 background: linear-gradient(#1a1d24, #1a1d24) padding-box,
  linear-gradient(to bottom, #d3b077, #916e34) border-box;
 border: 1px solid transparent;
 box-shadow: inset 0 0 0 1px #1e2028;
}

.controlado-lock-in-toggle.is-enabled .controlado-lock-in-box::after {
 content: "";
 position: absolute;
 left: 2px;
 top: -1px;
 width: 4px;
 height: 7px;
 border: solid #c7c1b0;
 border-width: 0 2px 2px 0;
 transform: rotate(45deg);
}

.controlado-lock-in-text {
 line-height: 1;
}

.controlado-pop-out-btn {
 margin-left: auto;
 padding: 2px 6px;
 background: transparent;
 border: 1px solid transparent;
 border-radius: 2px;
 color: #c8aa6e;
 font-size: 14px;
 cursor: pointer;
 opacity: 0.7;
 transition: opacity 120ms ease, border-color 120ms ease, background 120ms ease;
}

.controlado-pop-out-btn:hover {
 opacity: 1;
 border-color: #c8aa6e;
 background: rgba(200, 170, 110, 0.1);
}

lol-social-roster-group .group-header {
 display: flex;
 align-items: center;
}

.controlado-modal-backdrop {
 position: fixed;
 inset: 0;
 background: rgba(0, 0, 0, 0.7);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 99999;
 opacity: 0;
 pointer-events: none;
 transition: opacity 200ms ease;
}

.controlado-modal-backdrop.controlado-modal-visible {
 opacity: 1;
 pointer-events: auto;
}

.controlado-modal {
 font-family: "Beaufort for LOL", "Segoe UI", sans-serif;
 position: relative;
 background: linear-gradient(#010a13 0%, #0a1319 100%);
 background-origin: border-box;
 background-clip: padding-box, border-box;
 border: 2px solid transparent;
 border-radius: 8px;
 box-shadow: 
  0 0 0 2px transparent,
  inset 0 0 0 1px rgba(1, 10, 19, 0.9),
  0 8px 32px rgba(0, 0, 0, 0.5);
 background-image: 
  linear-gradient(#010a13 0%, #0a1319 100%),
  linear-gradient(to bottom, #5c4a2e, #a68b4a 25%, #c9a227 50%, #a68b4a 75%, #5c4a2e);
 min-width: 280px;
 max-width: 90vw;
 max-height: 85vh;
 display: flex;
 flex-direction: column;
}

.controlado-modal-header {
 position: relative;
 display: flex;
 align-items: center;
 justify-content: space-between;
 padding: 12px 40px 12px 14px;
 border-bottom: 1px solid rgba(42, 53, 66, 0.5);
 background: linear-gradient(to bottom, rgba(10, 19, 25, 0.6), transparent);
 flex-shrink: 0;
}

.controlado-modal-title {
 color: #c8aa6e;
 font-size: 13px;
 font-weight: 700;
 letter-spacing: 0.5px;
 text-transform: uppercase;
 font-family: "Beaufort for LOL", "Segoe UI", sans-serif;
}

.controlado-modal-close {
 position: absolute;
 top: -12px;
 right: -12px;
 width: 32px;
 height: 32px;
 padding: 0;
 display: flex;
 align-items: center;
 justify-content: center;
 background: linear-gradient(#0f1820 0%, #010a13 100%);
 border: 2px solid #a68b4a;
 color: #fff;
 font-size: 18px;
 line-height: 1;
 font-weight: 300;
 cursor: pointer;
 border-radius: 50%;
 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
 transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.controlado-modal-close:hover {
 transform: scale(1.05);
 box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
 border-color: #c9a227;
}

.controlado-modal-content {
 padding: 14px;
 overflow-y: auto;
 display: flex;
 flex-direction: column;
 gap: 12px;
}

.controlado-modal-content::-webkit-scrollbar {
 width: 8px;
}

.controlado-modal-content::-webkit-scrollbar-track {
 background: rgba(1, 10, 19, 0.8);
 border-radius: 4px;
 margin: 4px 0;
}

.controlado-modal-content::-webkit-scrollbar-thumb {
 background: linear-gradient(to bottom, #2a3542, #1a232e);
 border-radius: 4px;
 border: 2px solid rgba(1, 10, 19, 0.8);
}

.controlado-modal-content::-webkit-scrollbar-thumb:hover {
 background: linear-gradient(to bottom, #4a5565, #3a4555);
}

.controlado-modal-content .auto-select-checkboxes-div {
 border-top: none;
 margin-bottom: 4px;
}

.controlado-modal-detailed .controlado-modal-content {
 flex-direction: column;
 gap: 8px;
}

.controlado-modal-champ-rows {
 display: flex;
 flex-direction: column;
 gap: 6px;
}

.controlado-modal-champ-row {
 display: flex;
 align-items: center;
 gap: 10px;
 min-height: 36px;
}

.controlado-modal-champ-role {
 display: flex;
 align-items: center;
 min-width: 70px;
 font-size: 11px;
 color: #a0a0a0;
}

.controlado-modal-role-icon {
 width: 16px;
 height: 16px;
 margin-right: 4px;
 object-fit: contain;
}

.controlado-modal-champ-field {
 display: flex;
 align-items: center;
 gap: 8px;
 padding: 4px 8px;
 background: linear-gradient(180deg, rgba(15, 25, 35, 0.8), rgba(5, 12, 18, 0.8));
 border: 1px solid rgba(58, 69, 85, 0.7);
 cursor: pointer;
 min-width: 140px;
 transition: border-color 120ms ease, background 120ms ease;
}

.controlado-modal-champ-field:hover {
 border-color: #c8aa6e;
 background: rgba(25, 35, 45, 0.9);
}

.controlado-modal-champ-portrait {
 width: 28px;
 height: 28px;
 flex-shrink: 0;
 background-size: cover;
 background-position: center;
 border: 1px solid rgba(200, 170, 110, 0.35);
 box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.controlado-modal-champ-portrait.controlado-modal-champ-random {
 background: #0a1319;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 14px;
 color: #888;
}

.controlado-modal-champ-portrait.controlado-modal-champ-random::after {
 content: "?";
}

.controlado-modal-champ-name {
 color: #e8e6e3;
 font-size: 12px;
}

.controlado-champion-picker-backdrop {
 position: fixed;
 inset: 0;
 background: rgba(0, 0, 0, 0.8);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 100000;
 opacity: 0;
 pointer-events: none;
 transition: opacity 200ms ease;
}

.controlado-champion-picker-backdrop.controlado-picker-visible {
 opacity: 1;
 pointer-events: auto;
}

.controlado-champion-picker {
 font-family: "Beaufort for LOL", "Segoe UI", sans-serif;
 position: relative;
 background-origin: border-box;
 background-clip: padding-box, border-box;
 border: 2px solid transparent;
 border-radius: 8px;
 box-shadow: 
  inset 0 0 0 1px rgba(1, 10, 19, 0.9),
  0 8px 32px rgba(0, 0, 0, 0.5);
 background-image: 
  linear-gradient(#010a13 0%, #0a1319 100%),
  linear-gradient(to bottom, #5c4a2e, #a68b4a 25%, #c9a227 50%, #a68b4a 75%, #5c4a2e);
 width: min(720px, calc(100vw - 24px));
 max-height: 85vh;
 display: flex;
 flex-direction: column;
}

.controlado-picker-header {
 position: relative;
 display: flex;
 align-items: center;
 justify-content: space-between;
 padding: 8px 40px 8px 10px;
 border-bottom: 1px solid rgba(42, 53, 66, 0.5);
 background: linear-gradient(to bottom, rgba(10, 19, 25, 0.6), transparent);
 gap: 10px;
}

.controlado-picker-toolbar {
 display: flex;
 align-items: center;
 gap: 8px;
 flex: 1;
}

.controlado-picker-search {
 flex: 1;
 padding: 8px 12px;
 background: rgba(1, 10, 19, 0.9);
 border: 1px solid rgba(58, 69, 85, 0.8);
 color: #e8e6e3;
 font-size: 12px;
 transition: border-color 120ms ease, box-shadow 120ms ease;
}

.controlado-picker-search:focus {
 outline: none;
 border-color: rgba(200, 170, 110, 0.5);
 box-shadow: 0 0 0 2px rgba(200, 170, 110, 0.15);
}

.controlado-picker-search::placeholder {
 color: #666;
}

.controlado-picker-close {
 position: absolute;
 top: -12px;
 right: -12px;
 width: 32px;
 height: 32px;
 padding: 0;
 display: flex;
 align-items: center;
 justify-content: center;
 background: linear-gradient(#0f1820 0%, #010a13 100%);
 border: 2px solid #a68b4a;
 color: #fff;
 font-size: 18px;
 line-height: 1;
 font-weight: 300;
 cursor: pointer;
 border-radius: 50%;
 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
 transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.controlado-picker-close:hover {
 transform: scale(1.05);
 box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
 border-color: #c9a227;
}

.controlado-picker-grid {
 display: grid;
 grid-template-columns: repeat(7, 1fr);
 gap: 6px;
 padding: 10px;
 overflow-y: auto;
 max-height: 60vh;
}

.controlado-picker-grid::-webkit-scrollbar {
 width: 10px;
}

.controlado-picker-grid::-webkit-scrollbar-track {
 background: rgba(1, 10, 19, 0.8);
 border-radius: 4px;
 margin: 4px 0;
}

.controlado-picker-grid::-webkit-scrollbar-thumb {
 background: linear-gradient(to bottom, #2a3542, #1a232e);
 border-radius: 4px;
 border: 2px solid rgba(1, 10, 19, 0.8);
}

.controlado-picker-grid::-webkit-scrollbar-thumb:hover {
 background: linear-gradient(to bottom, #4a5565, #3a4555);
}

.controlado-picker-champ {
 display: flex;
 flex-direction: column;
 align-items: center;
 gap: 3px;
 padding: 4px;
 background: linear-gradient(180deg, rgba(15, 25, 35, 0.8), rgba(5, 12, 18, 0.8));
 border: 1px solid rgba(58, 69, 85, 0.6);
 cursor: pointer;
 transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.controlado-picker-champ:hover {
 border-color: rgba(200, 170, 110, 0.5);
 background: linear-gradient(180deg, rgba(25, 35, 45, 0.9), rgba(15, 22, 30, 0.9));
 box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.controlado-picker-champ.selected {
 border-color: #c8aa6e;
 box-shadow: 0 0 0 2px rgba(200, 170, 110, 0.3),
  inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.controlado-picker-champ-portrait-wrap {
 position: relative;
 width: 48px;
 height: 48px;
 flex-shrink: 0;
}

.controlado-picker-champ-portrait {
 width: 48px;
 height: 48px;
 background-size: cover;
 background-position: center;
 border: 1px solid rgba(200, 170, 110, 0.2);
}

.controlado-picker-champ-portrait-wrap .controlado-picker-champ-portrait {
 width: 100%;
 height: 100%;
}

.controlado-picker-star {
 position: absolute;
 top: 1px;
 right: 1px;
 width: 16px;
 height: 16px;
 padding: 0;
 background: none;
 border: none;
 color: #c8aa6e;
 cursor: pointer;
 opacity: 0;
 transition: opacity 150ms ease, color 120ms ease;
 display: flex;
 align-items: center;
 justify-content: center;
}

.controlado-picker-star svg {
 width: 10px;
 height: 10px;
 filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.98))
  drop-shadow(0 6px 12px rgba(0, 0, 0, 0.9));
}

.controlado-picker-star:not(.is-starred) .controlado-star-outline-stroke {
 fill: none;
 stroke: #0a0a0a;
 stroke-width: 3;
 paint-order: stroke;
}

.controlado-picker-star:not(.is-starred) .controlado-star-outline-inner {
 fill: none;
 stroke: currentColor;
 stroke-width: 1.5;
 paint-order: stroke;
}

.controlado-picker-champ:hover .controlado-picker-star,
.controlado-picker-star.is-starred {
 opacity: 1;
}

.controlado-picker-star:hover {
 color: #e5c890;
}

.controlado-picker-star.is-starred {
 color: #e5c890;
}

.controlado-picker-champ-portrait.controlado-picker-random {
 background: #0a1319;
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 20px;
 color: #666;
}

.controlado-picker-champ-portrait.controlado-picker-random::after {
 content: "?";
}

.controlado-picker-champ-name {
 font-size: 10px;
 color: #e8e6e3;
 text-align: center;
 max-width: 100%;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
}
`;
 document.head.appendChild(style);
}

let championSummaryCache = null;
async function getChampionSummaryMap() {
 if (!championSummaryCache) {
  const res = await request("GET", "/lol-game-data/assets/v1/champion-summary.json");
  if (res.ok) {
   const data = await res.json();
   championSummaryCache = data.reduce((m, c) => {
    const id = c.id ?? c.championId;
    if (id != null) m[id] = { squarePortraitPath: c.squarePortraitPath, alias: c.alias };
    return m;
   }, {});
  }
 }
 return championSummaryCache || {};
}

async function getPlayableChampions() {
 let response = await request("GET", "/lol-champions/v1/owned-champions-minimal");

 while (!response.ok) {
  console.debug("auto-champ-lock(owned-champions-minimal): Retrying...");
  response = await request("GET", "/lol-champions/v1/owned-champions-minimal");
  await sleep(1000);
 }

 const responseData = await response.json();
 const summaryMap = await getChampionSummaryMap();
 const enriched = responseData.map(c => {
  const id = c.id ?? c.championId;
  const extra = summaryMap[id] || {};
  return { ...c, ...extra };
 });
 enriched.sort((a, b) => a.name.localeCompare(b.name));
 return enriched;
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

 function getPickConfig() {
  const c = DataStore.get("controladoPick") || {};
  if (!c.championsByRole) c.championsByRole = { top: 21, jungle: 64, mid: 103, support: 89, adc: 51 };
  for (const r of ["top", "jungle", "mid", "support", "adc"]) {
   if (c.championsByRole[r] == null) c.championsByRole[r] = 21;
  }
  return c;
 }
 function getBanConfig() {
  const c = DataStore.get("controladoBan") || {};
  if (c.champion == null) c.champion = 21;
  return c;
 }
 function setPickChamp(role, id) {
  const c = getPickConfig();
  if (!c.championsByRole) c.championsByRole = {};
  c.championsByRole[role] = id;
  DataStore.set("controladoPick", c);
 }
 function setBanChamp(id) {
  const c = getBanConfig();
  c.champion = id;
  DataStore.set("controladoBan", c);
 }
 const champLockModal = createChampLockModal();
 const pluginSection = new SocialSection("AUTO CHAMP LOCK", dropdownsContainer, checkboxesContainer);
 pluginSection.setOnPopOut(() => champLockModal.open(dropdownsContainer, checkboxesContainer, pluginSection.element, {
  pickDropdowns: [topPlayableChampionsDropdown, junglePlayableChampionsDropdown, midPlayableChampionsDropdown, adcPlayableChampionsDropdown, supportPlayableChampionsDropdown],
  banDropdown: allChampionsBanDropdown,
  getPickConfig,
  getBanConfig,
  setPickChamp,
  setBanChamp
 }));
 socialContainer.append(pluginSection.element, checkboxesContainer, dropdownsContainer);

 function setupPickerClick(dropdown, roleOrBan) {
  dropdown.setOnPickerClick(async (d) => {
   const champs = await d.championsFunction();
   const championId = d.getSelectedChampionId(d.config) ?? -1;
   const isBan = roleOrBan === "ban";
   const picker = createChampionPickerModal(champs, championId, async (id) => {
    if (isBan) setBanChamp(id); else setPickChamp(roleOrBan, id);
    DataStore.set(isBan ? "controladoBan" : "controladoPick", isBan ? getBanConfig() : getPickConfig());
    await d.refresh();
    [topPlayableChampionsDropdown, junglePlayableChampionsDropdown, midPlayableChampionsDropdown, adcPlayableChampionsDropdown, supportPlayableChampionsDropdown, allChampionsBanDropdown].forEach(x => x?.refresh?.());
   }, { isBan });
   picker.open();
  });
 }

 setupPickerClick(topPlayableChampionsDropdown, "top");
 setupPickerClick(junglePlayableChampionsDropdown, "jungle");
 setupPickerClick(midPlayableChampionsDropdown, "mid");
 setupPickerClick(adcPlayableChampionsDropdown, "adc");
 setupPickerClick(supportPlayableChampionsDropdown, "support");
 setupPickerClick(allChampionsBanDropdown, "ban");

 [topPlayableChampionsDropdown, junglePlayableChampionsDropdown, midPlayableChampionsDropdown, adcPlayableChampionsDropdown, supportPlayableChampionsDropdown, allChampionsBanDropdown].forEach(d => {
  d.setSearchPopoverConfig({ getChampionIconUrl });
 });

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
   scheduleLockInMount();
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
   scheduleLockInMount();
  } else {
   championSelect.unmount();
   unmountChampSelectLockInToggle();
  }
 }

 console.debug("auto-champ-lock: loaded");
});
