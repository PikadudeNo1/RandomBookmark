if (!(window.chrome && chrome.runtime)) { window.chrome = browser; }
import chooseBookmark from './bookmarkSelection.module.js';
import storePersist from './storePersist.module.js';
import UiRoot from './svelteComponents/UiRoot.html';
import FolderNode from './svelteComponents/FolderNode.html';
import { Store } from 'svelte/store';

var l10nCached = {};
for (let message of FolderNode.cacheL10n) {
	l10nCached[message] = chrome.i18n.getMessage(message);
}
var store = new Store({
	l10n: chrome.i18n.getMessage,
	l10nCached,
});
var uiRoot = new UiRoot({
	target: document.body,
	store
});
store.onChosen = ({node, andSubfolders}) => {
	var bookmark = chooseBookmark(node, andSubfolders);
	window.open(bookmark.url);
};
store.onTogglePin = (id, on) => {
	var pins = store.get("pins");
	pins[on ? "add" : "delete"](id);
	store.set({pins});
	uiRoot.set({pinsDirty: true});
};
Promise.all([
	new Promise((resolve) => { chrome.bookmarks.getTree(([tree]) => { resolve(tree); }); }),
	storePersist(store)
]).then(([tree]) => {
	// TODO: Determine what should open automatically
	var pinList = [];
	var pinsToFind = new Set(store.get("pins"));
	function pinCheck(folder) {
		var id = folder.node.id;
		if (pinsToFind.has(id)) {
			pinList.push(folder);
			pinsToFind.delete(id);
		}
	}
	var folderList = makeFolderList(tree, pinCheck).list;
	uiRoot.set({pinList, missingPins: pinsToFind, folderList});
});
function makeFolderList(tree, pinCheck) {
	var list = [], hasChildBookmarks = false, hasDescendantBookmarks = false;
	for (let bookmarkNode of tree.children) {
		if (bookmarkNode.title == "") {
			// Blank-title folders are present in Firefox and contain uninteresting things like history, downloads, etc.
			continue;
		}
		if (bookmarkNode.type == "separator") {
			if (list.length && !list[list.length - 1].separator) {
				list.push({separator: true});
			}
			continue;
		}
		if (!bookmarkNode.children) {
			if (bookmarkNode.url) { hasChildBookmarks = hasDescendantBookmarks = true; }
			continue;
		}
		let folderData = Object.assign(makeFolderList(bookmarkNode, pinCheck), {node: bookmarkNode});
		pinCheck(folderData);
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