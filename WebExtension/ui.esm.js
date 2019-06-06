import chooseBookmark from './bookmarkSelection.esm.js';
import { stores, ready as storageReady } from './storage.esm.js';
import UiRoot from './svelte/UiRoot.svelte';
import sniffBrowser from './sniffBrowser.esm.js';
import { get as readStore } from 'svelte/store';
import { set as idbSet, get as idbGet, Store as IdbKeyvalStore } from "idb-keyval";

var folderBookmarkNodes = new Map();
var uiRoot = new UiRoot({ target: document.body });
var cacheStore = new IdbKeyvalStore("cache", "keyval");
export function onChosen({id, andSubfolders}) {
	var node = folderBookmarkNodes.get(id);
	var bookmark = chooseBookmark(node, andSubfolders);
	chrome.tabs.create({url: bookmark.url});
	window.close();
}
export function onTogglePin(id, on) {
	var pins = readStore(stores.pins);
	pins[on ? "add" : "delete"](id);
	stores.pins.set(pins);
	uiRoot.$set({pinsDirty: true});
}
export function cleanPins(missingPins) {
	var pins = readStore(stores.pins);
	for (let id of missingPins) {
		pins.delete(id);
	}
	stores.pins.set(pins);
	uiRoot.$set({missingPins: null});
}
var browserCheck = sniffBrowser();
browserCheck.then((browserName) => {
	var browserDisplayHelper = ({
		Chrome() {
			// Workaround for CSS body { overflow: hidden; } not working correctly
			getComputedStyle(document.body).height; // force layout
			document.body.style.height = "auto";

			document.getElementById("optionsPane").style.paddingBottom = "4px";
		},
		Firefox: async function() {
			// Workaround for cutoff when ui.html is shown in the overflow menu
			var curWindow = await browser.windows.getCurrent();
			document.body.style.height =
				`${screen.availHeight - Math.max(curWindow.top, 0) - 150}px`;
			document.getElementById("flexContainer").style.maxHeight = "100%";
		},
	})[browserName];
	if (browserDisplayHelper) { browserDisplayHelper(); }
});
var bookmarksFetch = new Promise( (resolve) => {
	chrome.bookmarks.getTree( ([tree]) => { resolve(tree); } );
} );
Promise.all([
	bookmarksFetch,
	browserCheck,
	storageReady
]).then(([tree, browserName]) => {
	var folderListAutoNav = ({
		Chrome(navTree) {
			var autoOpenThese = new Set(["1", "2"]);
			for (let navNode of navTree) {
				if (autoOpenThese.has(navNode.id)) {
					navNode.expand();
				}
			}
		},
		Firefox(navTree) {
			var autoOpenThese = new Set(["menu________", "toolbar_____"]);
			for (let navNode of navTree) {
				if (autoOpenThese.has(navNode.id)) {
					navNode.expand();
				}
			}
		},
	})[browserName];

	var pinList = [], pinsToFind = new Set( readStore(stores.pins) );
	function perFolder(folder, node) {
		var {id} = folder;
		folderBookmarkNodes.set(id, node);
		if (pinsToFind.has(id)) {
			pinList.push(folder);
			pinsToFind.delete(id);
		}
	}
	var folderList = makeFolderList(tree, perFolder).list;
	uiRoot.$set({pinList, folderList, folderListAutoNav});
	if (pinsToFind.size) { uiRoot.$set({missingPins: pinsToFind}); }
	set("folderCache", folderList, cacheStore);
	chrome.alarms.create("clearCache", {delayInMinutes: 15});
});
function makeFolderList(tree, perFolder) {
	var list = [], hasChildBookmarks = false, hasDescendantBookmarks = false;
	for (let bookmarkNode of tree.children) {
		if (bookmarkNode.type == "separator") {
			if (list.length && !list[list.length - 1].separator) {
				list.push({separator: true});
			}
			continue;
		}
		if (bookmarkNode.title == "") {
			// Blank-title folders are present in Firefox and contain uninteresting things like history, downloads, etc.
			continue;
		}
		if (!bookmarkNode.children) {
			if (bookmarkNode.url) { hasChildBookmarks = hasDescendantBookmarks = true; }
			continue;
		}
		let folderData = makeFolderList(bookmarkNode, perFolder);
		folderData.id = bookmarkNode.id;
		folderData.title = bookmarkNode.title;
		perFolder(folderData, bookmarkNode);
		list.push(folderData);
		if (folderData.hasDescendantBookmarks) {
			hasDescendantBookmarks = true;
		}
	}
	while (list.length && list[list.length - 1].separator) {
		list.pop();
	}
	return {list, hasChildBookmarks, hasDescendantBookmarks};
}