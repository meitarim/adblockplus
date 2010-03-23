/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview Code responsible for showing and hiding object tabs.
 * This file is included from AdblockPlus.js.
 */

XPCOMUtils.defineLazyServiceGetter(this, "accessibleRetrieval", "@mozilla.org/accessibleRetrieval;1", "nsIAccessibleRetrieval");

/**
 * Class responsible for showing and hiding object tabs.
 * @class
 */
var objTabs =
{
  /**
   * Number of milliseconds to wait until hiding tab after the mouse moves away.
   * @type Integer
   */
  HIDE_DELAY: 1000,

  /**
   * Document element the object tab is currently being displayed for.
   * @type Element
   */
  currentElement: null,

  /**
   * Data associated with the current element
   * @type RequestEntry
   */
  currentElementData: null,

  /**
   * Window of the current element.
   * @type Window
   */
  currentElementWindow: null,

  /**
   * Panel element currently used as object tab.
   * @type Element
   */
  objtabElement: null,

  /**
   * Timer used to delay hiding of the object tab.
   * @type nsITimer
   */
  hideTimer: null,

  /**
   * Used when hideTimer is running, time when the tab should be hidden.
   * @type Integer
   */
  hideTargetTime: 0,

  /**
   * Will be set to true in Gecko 1.9/1.9.1, needed for correct popup positioning.
   * @type Boolean
   */
  _needPositionHack: (abp.versionComparator.compare(
                        Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).platformVersion,
                        "1.9.2") < 0),

  /**
   * Called to show object tab for an element.
   */
  showTabFor: function(/**Element*/ element)
  {
    if (!prefs.frameobjects)
      return;

    if (this.hideTimer)
    {
      this.hideTimer.cancel();
      this.hideTimer = null;
    }

    if (this.objtabElement)
      this.objtabElement.style.opacity = "";

    if (this.currentElement != element)
    {
      this._hideTab();

      let data = RequestList.getDataForNode(element, true);
      if (data)
      {
        let doc = element.ownerDocument.defaultView
                         .QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIWebNavigation)
                         .QueryInterface(Ci.nsIDocShellTreeItem)
                         .rootTreeItem
                         .QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindow)
                         .document;
        let objTab = doc.getElementById("abp-objtab");
        if (objTab && objTab.wrappedJSObject)
          objTab = objTab.wrappedJSObject;
  
        let hooks = doc.getElementById("abp-hooks");
        if (hooks && hooks.wrappedJSObject)
          hooks = hooks.wrappedJSObject;

        // Only open popup in focused window, will steal focus otherwise
        if (objTab && (!hooks || hooks.isFocused))
          this._showTab(objTab, element, data[1]);
      }
    }
  },

  /**
   * Called to hide object tab for an element (actual hiding happens delayed).
   */
  hideTabFor: function(/**Element*/ element)
  {
    if (element != this.currentElement)
      return;

    this.hideTargetTime = Date.now() + this.HIDE_DELAY;
    this.hideTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.hideTimer.init(this, 40, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  /**
   * Makes the tab element visible.
   */
  _showTab: function(/**Element*/ objTab, /**Element*/ element, /**RequestEntry*/ data)
  {
    this.objtabElement = objTab
    this.currentElement = element;
    this.currentElementData = data;
    this.currentElementWindow = element.ownerDocument.defaultView;

    this.currentElementWindow.addEventListener("MozAfterPaint", objectWindowEventHandler, false);
    this.currentElementWindow.addEventListener("unload", objectWindowEventHandler, false);
    this.currentElementWindow.addEventListener("blur", objectWindowEventHandler, false);

    this.objtabElement.nodeData = this.currentElementData;
    this.objtabElement.addEventListener("mouseover", objectTabEventHander, false);
    this.objtabElement.addEventListener("mouseout", objectTabEventHander, false);
    this.objtabElement.addEventListener("click", objectTabEventHander, false);
    this.objtabElement.addEventListener("contextmenu", objectTabEventHander, false);
    this.objtabElement.addEventListener("popuphidden", objectTabEventHander, false);

    this.objtabElement.style.opacity = "0";
    this.objtabElement.openPopupAtScreen(0, 0, false);
    runAsync(function()
    {
      this._positionTab();
      this.objtabElement.style.opacity = "";
      if (this._needPositionHack)
      {
        let dummy = this.objtabElement.boxObject.width;
        this.objtabElement.moveTo(this.lastTabPos.x, this.lastTabPos.y);
      }
    }, this);
  },

  /**
   * Hides the tab element.
   */
  _hideTab: function()
  {
    if (this.objtabElement)
    {
      // Prevent recursive calls via popuphidden handler
      let objtab = this.objtabElement;
      this.objtabElement = null;
      this.currentElement = null;
      this.currentElementData = null;

      if (this.hideTimer)
      {
        this.hideTimer.cancel();
        this.hideTimer = null;
      }

      try {
        objtab.hidePopup();
      } catch (e) {}
      objtab.removeEventListener("mouseover", objectTabEventHander, false);
      objtab.removeEventListener("mouseout", objectTabEventHander, false);
      objtab.removeEventListener("click", objectTabEventHander, false);
      objtab.removeEventListener("contextmenu", objectTabEventHander, false);
      objtab.removeEventListener("popuphidden", objectTabEventHander, false);
      objtab.nodeData = null;

      this.currentElementWindow.removeEventListener("MozAfterPaint", objectWindowEventHandler, false);
      this.currentElementWindow.removeEventListener("unload", objectWindowEventHandler, false);
      this.currentElementWindow.removeEventListener("blur", objectWindowEventHandler, false);
      this.currentElementWindow = null;
    }
  },

  /**
   * Updates position of the tab element.
   */
  _positionTab: function()
  {
    // Test whether element is still in document
    if (!this.currentElement.offsetWidth || !this.currentElement.offsetHeight)
    {
      this._hideTab();
      return;
    }

    let coords = this.getScreenCoords(this.currentElement);
    let screenX = coords.left + coords.width - this.objtabElement.boxObject.width;
    let screenY = coords.top - this.objtabElement.boxObject.height;

    // Restrict coordinates by the boundaries of the current window
    let boundaries = this.getWindowScreenCoords(this.currentElementWindow);
    screenX = Math.max(screenX, boundaries.left, 0);
    screenY = Math.max(screenY, boundaries.top, 0);
    screenX = Math.min(screenX, boundaries.left + boundaries.width - this.objtabElement.boxObject.width);
    screenY = Math.min(screenY, boundaries.top + boundaries.height - this.objtabElement.boxObject.height);

    // Round coordinates - it seems that Gecko is doing that internally as well
    screenX = Math.round(screenX);
    screenY = Math.round(screenY);

    if (this._needPositionHack)
    {
      // Distort screen coordinates in the right way, moveTo() is broken on
      // 1.9.0/1.9.1
      let parentBox = this.objtabElement.ownerDocument.documentElement.boxObject;
      screenX += parentBox.screenX;
      screenY += parentBox.screenY;
    }

    this.lastTabPos = {x: screenX, y: screenY};
    this.objtabElement.moveTo(screenX, screenY);
  },

  /**
   * Retrieves screen position of an element.
   */
  getScreenCoords: function(/**Element*/ element) /**nsIDOMClientRect*/
  {
    let wnd = element.ownerDocument.defaultView;
    if ("mozInnerScreenX" in wnd)
    {
      // Gecko 1.9.2+
      let rect = element.getBoundingClientRect();
      let factor = wnd.QueryInterface(Ci.nsIInterfaceRequestor)
                      .getInterface(Ci.nsIDOMWindowUtils)
                      .screenPixelsPerCSSPixel;
      return {left: (wnd.mozInnerScreenX + rect.left) * factor, top: (wnd.mozInnerScreenY + rect.top) * factor,
              width: rect.width * factor, height: rect.height * factor};
    }
    else
    {
      // Hack for Gecko 1.9.0/1.9.1 - recalculate screen position using
      // accessibility API
      let left = {}, top = {}, width = {}, height = {};
      accessibleRetrieval.getAccessibleFor(element).getBounds(left, top, width, height);

      return {left: left.value, top: top.value, width: width.value, height: height.value};
    }
  },

  /**
   * Retrieves screen position of a window.
   */
  getWindowScreenCoords: function(/**Window*/ wnd) /**nsIDOMClientRect*/
  {
    if ("mozInnerScreenX" in wnd)
    {
      // Gecko 1.9.2+
      let factor = wnd.QueryInterface(Ci.nsIInterfaceRequestor)
                      .getInterface(Ci.nsIDOMWindowUtils)
                      .screenPixelsPerCSSPixel;
      return {left: wnd.mozInnerScreenX * factor, top: wnd.mozInnerScreenY * factor,
              width: wnd.innerWidth * factor, height: wnd.innerHeight * factor};
    }
    else
    {
      // Hack for Gecko 1.9.0/1.9.1 - recalculate screen position using
      // accessibility API
      let left = {}, top = {}, width = {}, height = {};
      accessibleRetrieval.getAccessibleFor(wnd.document).getBounds(left, top, width, height);

      return {left: left.value, top: top.value, width: width.value, height: height.value};
    }
  },

  /**
   * Shows or hides the address of the current element in browser's status bar.
   */
  showStatus: function(/**Boolean*/ doShow)
  {
    let browserWindow = null;
    try {
      browserWindow = this.objtabElement.ownerDocument.defaultView
                          .QueryInterface(Ci.nsIInterfaceRequestor)
                          .getInterface(Ci.nsIWebNavigation)
                          .QueryInterface(Ci.nsIDocShellTreeItem)
                          .treeOwner
                          .QueryInterface(Ci.nsIInterfaceRequestor)
                          .getInterface(Ci.nsIXULWindow)
                          .XULBrowserWindow;
    } catch(e) {}
    if (!browserWindow)
      return;

    if (doShow)
      browserWindow.setOverLink(this.currentElementData.location, null);
    else
      browserWindow.setOverLink("", null);
  },

  /**
   * Shows context menu for the current element at the specified screen position.
   */
  showContextMenu: function(/**Integer*/ screenX, /**Integer*/ screenY)
  {
    let hooks = this.objtabElement.ownerDocument.getElementById("abp-hooks");
    if (!hooks.getContextMenu)
      return;

    let context = hooks.getContextMenu();
    if (!context)
      return;

    let fakeLink = this.currentElement.ownerDocument.createElement("a");
    fakeLink.setAttribute("href", this.currentElementData.location);
    this.currentElementData.attachTo(fakeLink);

    context.ownerDocument.popupNode = fakeLink;
    context.openPopupAtScreen(screenX, screenY, true);
  },

  /**
   * Opens location of the current element in a new tab.
   */
  openLocationInTab: function()
  {
    abp.loadInBrowser(this.currentElementData.location, this.objtabElement.ownerDocument.defaultView);
  },

  /**
   * Called whenever a timer fires.
   */
  observe: function(/**nsISupport*/ subject, /**String*/ topic, /**String*/ data)
  {
    if (subject == this.hideTimer)
    {
      let now = Date.now();
      if (now >= this.hideTargetTime)
        this._hideTab();
      else if (this.hideTargetTime - now < this.HIDE_DELAY / 2)
      {
        this.objtabElement.style.opacity = (this.hideTargetTime - now) * 2 / this.HIDE_DELAY;
        if (this._needPositionHack)
        {
          let dummy = this.objtabElement.boxObject.width;
          this.objtabElement.moveTo(this.lastTabPos.x, this.lastTabPos.y);
        }
      }
    }
  }
};

/**
 * Function called whenever the mouse enters or leaves an object.
 */
function objectMouseEventHander(/**Event*/ event)
{
  if (event.type == "mouseover")
    objTabs.showTabFor(event.target);
  else if (event.type == "mouseout")
    objTabs.hideTabFor(event.target);
}

/**
 * Function called for paint events of the object tab window.
 */
function objectWindowEventHandler(/**Event*/ event)
{
  if (event.type == "MozAfterPaint")
    objTabs._positionTab();
  else if (event.type == "unload" || event.type == "blur")
    objTabs._hideTab();
}

/**
 * Function called whenever the mouse enters or leaves an object tab.
 */
function objectTabEventHander(/**Event*/ event)
{
  if (event.type == "mouseover")
  {
    objTabs.showTabFor(objTabs.currentElement);
    objTabs.showStatus(true);
  }
  else if (event.type == "mouseout")
  {
    objTabs.hideTabFor(objTabs.currentElement);
    objTabs.showStatus(false);
  }
  else if (event.type == "popuphidden")
    objTabs._hideTab();
  else if (event.type == "contextmenu")
    objTabs.showContextMenu(event.screenX, event.screenY);
  else if (event.type == "click" && event.button == 1)
    objTabs.openLocationInTab();
}

abp.objTabs = objTabs;