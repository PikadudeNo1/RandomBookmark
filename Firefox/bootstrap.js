"use strict";
Components.utils.import("resource://gre/modules/Services.jsm");
var windowWatcher = Services.ww;
var observer = {observe: function(window, eventType) {
	if (eventType == "domwindowopened") { foundWindow(window); }
} };
function windows() {
	var winEnum = windowWatcher.getWindowEnumerator();
	while (winEnum.hasMoreElements()) {
		yield winEnum.getNext();
	}
}
function startup() {
	windowWatcher.registerNotification(observer);
	for (let window of windows()) {
		foundWindow(window);
	}
}
function foundWindow(window) {
	window = window.QueryInterface(Components.interfaces.nsIDOMWindow);
	if (window.document.readyState != "complete") {
		window.addEventListener("load", loadedWindow, true);
		return;
	}
	if (window.document.getElementById("placesContext") == null) { return; }
	Services.scriptloader.loadSubScript("chrome://RandomBookmarkFromFolder/content/placesContextMod.js", window);
}
function loadedWindow() {
	foundWindow(this);
}
function shutdown() {
	windowWatcher.unregisterNotification(observer);
	Components.utils.unload("chrome://RandomBookmarkFromFolder/content/StringBundle.js");
	for (let window of windows()) {
		window = window.QueryInterface(Components.interfaces.nsIDOMWindow);
		window.removeEventListener("load", loadedWindow, true);
		if (window.cleanUpRandomBookmarkFromFolder) {
			window.cleanUpRandomBookmarkFromFolder();
		}
	}
}
function uninstall(data, reason) {
	// Guarantee that if a new version is installed, it has the new strings
	// https://bugzilla.mozilla.org/show_bug.cgi?id=719376
	Services.strings.flushBundles();
	
	if (reason == ADDON_UNINSTALL) {
		Service.prefs.getBranch("extensions.RandomBookmarkFromFolder.").deleteBranch("");
	}
}