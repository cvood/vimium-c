// Generated by CoffeeScript 1.8.0
(function() {
  "use strict";
  var BackgroundCommands, checkKeyQueue, currentVersion //
    , fetchHttpContents, frameIdsForTab, generateCompletionKeys, IncognitoContentSettings //
    , handleMainPort, handleResponse, postResponse //
    , getActualKeyStrokeLength, getCompletionKeysRequest //
    , helpDialogHtmlForCommandGroup, keyQueue, moveTab, namedKeyRegex //
    , openMultiTab //
    , populateKeyCommands, registerFrame, reRegisterFrame, splitKeyQueueRegex //
    , removeTabsRelative, root, selectTab //
    , requestHandlers, sendRequestToAllTabs //
    , shouldShowUpgradeMessage, singleKeyCommands, splitKeyIntoFirstAndSecond, splitKeyQueue //
    , unregisterFrame, validFirstKeys, shouldShowActionIcon, setBadge;

  root = typeof exports !== "undefined" && exports !== null ? exports : window;

  shouldShowActionIcon = chrome.browserAction && chrome.browserAction.setIcon ? true : false;

  currentVersion = Utils.getCurrentVersion();

  keyQueue = "";

  validFirstKeys = {};

  singleKeyCommands = [];

  frameIdsForTab = {};
  
  root.getFrameIdsForTab = function() {
    return frameIdsForTab;
  };

  namedKeyRegex = /^(<(?:[amc]-.|(?:[amc]-)?[a-z0-9]{2,5})>)(.*)$/;

  root.filesContent = {
    vomnibar: "pages/vomnibar.html",
    help_dialog: "pages/help_dialog.html"
  };

  chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "main") {
      port.onMessage.addListener(handleMainPort);
    } else {
      port.disconnect();
    }
  });

  root.helpDialogHtml = function(showUnboundCommands, showCommandNames, customTitle) {
    var command, commandsToKey, dialogHtml, group, key;
    commandsToKey = {};
    for (key in Commands.keyToCommandRegistry) {
      command = Commands.keyToCommandRegistry[key].command;
      commandsToKey[command] = (commandsToKey[command] || []).concat(key);
    }
    dialogHtml = filesContent.help_dialog;
    return dialogHtml.replace(new RegExp("\\{\\{(version|title|" + Object.keys(Commands.commandGroups).join('|') + ")\\}\\}", "g"), function(_, group) {
      return (group === "version") ? currentVersion
        : (group === "title") ? (customTitle || "Help")
        : helpDialogHtmlForCommandGroup(group, commandsToKey, Commands.availableCommands, showUnboundCommands, showCommandNames);
    });
  };

  helpDialogHtmlForCommandGroup = function(group, commandsToKey, availableCommands, showUnboundCommands, showCommandNames) {
    var bindings, command, html, isAdvanced, _i, _len, _ref;
    html = [];
    _ref = Commands.commandGroups[group];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      command = _ref[_i];
      bindings = (commandsToKey[command] || [""]).join(", ");
      if (showUnboundCommands || commandsToKey[command]) {
        isAdvanced = Commands.advancedCommands.indexOf(command) >= 0;
        html.push("<tr class='vimB vimI vimiumHelpTr" + (isAdvanced ? " vimiumHelpAdvanced" : "")
          , "'>\n\t<td class='vimB vimI vimiumHelpTd vimiumHelpShortKey'>\n\t\t<span class='vimB vimI vimiumHelpShortKey2'>", Utils.escapeHtml(bindings)
          , "</span>\n\t</td>\n\t<td class='vimB vimI vimiumHelpTd'>:</td>\n\t<td class='vimB vimI vimiumHelpTd vimiumHelpCommandInfo'>"
          , Utils.escapeHtml(availableCommands[command].description));
        if (showCommandNames) {
          html.push("\n\t\t<span class='vimB vimI vimiumHelpCommandName'>(" + command + ")</span>");
        }
        html.push("</td>\n</tr>\n");
      }
    }
    return html.join("");
  };

  fetchHttpContents = function(url, callback) {
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function () {
      if(req.readyState === 4) {
        var text = req.responseText, status = req.status;
        req = null;
        callback(text, status);
      }
    };
    req.send();
    return req;
  };

  getCompletionKeysRequest = function() {
    return {
      name: "refreshCompletionKeys",
      completionKeys: generateCompletionKeys(),
      keyQueue: keyQueue,
      validFirstKeys: validFirstKeys
    };
  };

  openMultiTab = function(rawUrl, index, count, windowId, active) {
    var option = {
      url: rawUrl,
      windowId: windowId,
      index: index,
      selected: active !== false
    };
    while(--count >= 0) {
      chrome.tabs.create(option);
      ++option.index;
      option.selected = false;
    }
  };

  IncognitoContentSettings = {
    _urlHeadRegex: /^[a-z]+:\/\/[^\/]+\//,
    ensure: function (contentType, tab) {
      if (!Utils.hasOrdinaryUrlPrefix(tab.url) || tab.url.startsWith("chrome")) {
        return;
      }
      var pattern = tab.url, work, _this = this;
      if (!pattern.startsWith("file:")) {
        pattern = this._urlHeadRegex.exec(tab.url)[0] + "*";
      }
      chrome.contentSettings[contentType].get({primaryUrl: tab.url, incognito: true }, function(opt) {
        if (chrome.runtime.lastError) {
          chrome.contentSettings[contentType].get({primaryUrl: tab.url}, function (opt) {
            if (opt && opt.setting === "allow") { return; }
            chrome.windows.create({type: "normal", incognito: true, url: Settings.ChromeInnerNewTab}, function (wnd) {
              var leftTabId = wnd.tabs[0].id;
              _this.setAndUpdate(contentType, tab, pattern, wnd.id, true, function() {
                chrome.tabs.remove(leftTabId);
              });
            });
          });
          return chrome.runtime.lastError;
        }
        if (opt && opt.setting === "allow" && tab.incognito) {
          _this.updateTab(tab);
          return;
        }
        chrome.windows.getAll(function(wnds) {
          wnds = wnds.filter(function(wnd) { return wnd.type === "normal" && wnd.incognito; });
          if (wnds.length < 1) {
            console.log("%cContentTempSettings.ensure", "color:red;", "get incognito content settings", opt //
              , " but can not find a incognito window");
          } else if (opt && opt.setting === "allow") {
            _this.updateTab(tab, wnds[wnds.length - 1].id);
          } else if (tab.incognito && wnds.filter(function(wnd) { return wnd.id === tab.windowId; }).length === 1) {
            _this.setAndUpdate(contentType, tab, pattern);
          } else {
            _this.setAndUpdate(contentType, tab, pattern, wnds[wnds.length - 1].id);
          }
        });
      });
    },
    setAndUpdate: function(contentType, tab, pattern, wndId, doSyncWnd, callback) {
      callback = this.updateTabAndWindow.bind(this, tab, wndId, callback);
      this.setAllowInIncognito(contentType, pattern, doSyncWnd && wndId !== tab.windowId
        ? chrome.windows.get.bind(chrome.windows, tab.windowId, callback) : callback);
    },
    setAllowInIncognito: function(contentType, pattern, callback) {
      chrome.contentSettings[contentType].set({
        primaryPattern: pattern,
        scope: "incognito_session_only",
        setting: "allow"
      }, function() {
        if (callback) {
          callback();
        }
        return chrome.runtime.lastError;
      });
    },
    updateTabAndWindow: function(tab, wndId, callback, oldWnd) {
      this.updateTab(tab, wndId, callback);
      wndId && chrome.windows.update(wndId, oldWnd ? {
        focused: true,
        state: oldWnd.state
      } : {
        focused: true
      });
    },
    updateTab: function(tab, newWindowId, callback) {
      var options = {
        windowId: newWindowId ? newWindowId : tab.windowId,
        selected: true,
        url: tab.url
      };
      if (!newWindowId || tab.windowId === newWindowId) {
        options.index = tab.index + 1;
      }
      chrome.tabs.create(options);
      chrome.tabs.remove(tab.id);
      if (callback) {
        callback();
      }
    }
  };

  /* repeatFunction = function(func, totalCount, tab, currentCount, frameId, port) {
    var callback;
    if (currentCount < totalCount) {
      if (++currentCount < totalCount) {
        callback = function(newTab) {
          func(newTab || tab, ++currentCount < totalCount ? callback : null, frameId, port);
        };
      }
      func(tab, callback, frameId, port);
    }
  }; */

  // function (const Tab tab, const int repeatCount, const int frameId, const Port port);
  BackgroundCommands = {
    createTab: function(tab, count) {
      chrome.windows.get(tab.windowId, function(wnd) {
        var url = Settings.get("newTabUrl");
        if (!(wnd.incognito && Utils.isRefusingIncognito(url))) {
          openMultiTab(url, tab.index + 1, count, tab.windowId);
          return;
        }
        // this url will be disabled if opened in a incognito window directly
        chrome.tabs.getAllInWindow(tab.windowId, function(allTabs) {
          var urlLower = url.toLowerCase().split('#', 1)[0],
            repeat = count > 1 ? function(tab1) {
              var left = count;
              while (--left > 0) {
                chrome.tabs.duplicate(tab1.id);
              }
            } : null;
          if (urlLower.indexOf("://") < 0) {
            urlLower = chrome.runtime.getURL(urlLower);
          }
          allTabs = allTabs.filter(function(tab1) {
            var url = tab1.url.toLowerCase(), end = url.indexOf("#");
            return ((end < 0) ? url : url.substring(0, end)) === urlLower;
          });
          if (allTabs.length > 0) {
            urlLower = allTabs.filter(function(tab1) {
              return tab1.index >= tab.index;
            });
            tab = (urlLower.length > 0) ? urlLower[0] : allTabs[allTabs.length - 1];
            chrome.tabs.duplicate(tab.id);
            repeat && repeat(tab);
            return;
          }
          chrome.tabs.create({
            selected: false,
            url: url
          }, function(newTab) {
            chrome.windows.create({
              type: "normal",
              left: 0,
              top: 0,
              width: 50,
              height: 50,
              incognito: true,
              tabId: newTab.id
            }, function() {
              chrome.tabs.move(newTab.id, {
                index: tab.index + 1,
                windowId: tab.windowId
              }, function() {
                if (repeat) {
                  repeat(newTab);
                }
                chrome.tabs.update(newTab.id, {
                  selected: true 
                });
              });
            });
          });
        });
      });
    },
    duplicateTab: function(tab, count) {
      chrome.tabs.duplicate(tab.id);
      if (!(count > 1)) {
        return;
      }
      chrome.windows.get(tab.windowId, function(wnd) {
        if (wnd.incognito && Utils.isRefusingIncognito(tab.url)) {
          while (--count > 0) {
            chrome.tabs.duplicate(tab.id);
          }
        } else {
          openMultiTab(tab.url, tab.index + 2, count - 1, tab.windowId, false);
        }
      });
    },
    moveTabToNextWindow: function(tab) {
      chrome.windows.getAll(function(wnds) {
        var b = tab.incognito;
        wnds = wnds.filter(function(wnd) { return wnd.type === "normal" && wnd.incognito === b; });
        if (wnds.length === 0) {
          chrome.windows.create({
            type: "normal",
            tabId: tab.id,
            incognito: tab.incognito
          });
          return;
        }
        var ids = wnds.map(function(wnd) { return wnd.id; }), index = ids.indexOf(tab.windowId);
        if (ids.length >= 2 || index === -1) {
          chrome.tabs.getSelected(ids[ids.length === ++index ? 0 : index], function(tab2) {
            chrome.tabs.move(tab.id, {index: tab2.index + 1, windowId: tab2.windowId});
            chrome.tabs.update(tab.id, {selected: true});
            chrome.windows.update(tab2.windowId, {focused: true});
          });
          return;
        }
        chrome.tabs.getAllInWindow(tab.windowId, function(curTabs) {
          if (curTabs.length === 1) { return; }
          chrome.windows.create({
            type: "normal",
            tabId: tab.id,
            incognito: tab.incognito
          });
        });
      });
    },
    moveTabToIncognito: function(tab) {
      chrome.windows.get(tab.windowId, function(wnd) {
        if (wnd.incognito && tab.incognito) { return; }
        var options = {
          type: "normal",
          tabId: tab.id,
          incognito: true
        }, url = tab.url;
        if (url.startsWith("chrome") && url.toLowerCase() !== Settings.ChromeInnerNewTab) {
          if (wnd.incognito) {
            return;
          } else if (url.startsWith("chrome://downloads/")) {
            options.url = url;
          }
        } else if (!tab.incognito) {
          options.url = url;
        }
        chrome.windows.getAll(function(wnds) {
          wnds = wnds.filter(function(wnd) { return wnd.type === "normal" && wnd.incognito; });
          if (wnds.length >= 1) {
            var wndId = wnds[wnds.length - 1].id;
            chrome.tabs.getSelected(wndId, function(tab2) {
              if (options.url) {
                chrome.tabs.create({url: options.url, index: tab2.index + 1, windowId: wndId});
                chrome.tabs.remove(options.tabId);
              } else {
                chrome.tabs.move(options.tabId, {index: tab2.index + 1, windowId: wndId});
                chrome.tabs.update(options.tabId, {selected: true});
              }
              chrome.windows.update(wndId, {focused: true});
            });
          } else {
            if (options.url) {
              var tabId = options.tabId;
              delete options.tabId;
              chrome.windows.create(options);
              chrome.tabs.remove(tabId);
            } else {
              chrome.windows.create(options);
            }
          }
        });
      });
    },
    enableImageTemp: function(tab) {
      IncognitoContentSettings.ensure("images", tab);
    },
    nextTab: function(tab, count) {
      selectTab(tab, count);
    },
    previousTab: function(tab, count) {
      selectTab(tab, -count);
    },
    firstTab: function(tab) {
      selectTab(tab, -tab.index);
    },
    lastTab: function(tab) {
      selectTab(tab, -tab.index - 1);
    },
    removeTab: function(tab, count) {
      if (tab.index > 0) {
        if (count > 1) {
          removeTabsRelative(tab, count);
        } else {
          chrome.tabs.remove(tab.id);
        }
        return;
      }
      chrome.tabs.getAllInWindow(tab.windowId, function(curTabs) {
        if (!curTabs || curTabs.length > count) {
          if (count > 1) {
            removeTabsRelative(tab, count);
          } else {
            chrome.tabs.remove(tab.id);
          }
          return;
        }
        chrome.windows.getAll(function(wnds) {
          var url = Settings.get("newTabUrl"), toCreate;
          wnds = wnds.filter(function(wnd) {
            return wnd.type === "normal";
          });
          if (wnds.length <= 1) {
            // retain the last window
            toCreate = {};
            if (wnds.length === 1 && wnds[0].incognito && !Utils.isRefusingIncognito(url)) {
              toCreate.windowId = wnds[0].id;
            }
            // other urls will be disabled if incognito else auto in current window
          }
          else if (! tab.incognito) {
            // retain the last "normal & not incognito" window which has currentTab if it exists
            wnds = wnds.filter(function(wnd) {
              return ! wnd.incognito;
            });
            if (wnds.length === 1 && wnds[0].id === tab.windowId) {
              toCreate = { windowId: tab.windowId };
            }
          }
          if (toCreate) {
            curTabs = (curTabs.length > 1) ? curTabs.map(function(tab) {
              return tab.id;
            }) : [tab.id];
            toCreate.url = url;
            chrome.tabs.create(toCreate);
            chrome.tabs.remove(curTabs);
          } else {
            chrome.windows.remove(tab.windowId);
          }
        });
      });
    },
    restoreTab: function(_0, count, _2, _3, sessionId) {
      if (sessionId) {
        chrome.sessions.restore(sessionId);
        return;
      }
      while (--count >= 0) {
        chrome.sessions.restore();
      }
    },
    openCopiedUrlInCurrentTab: function(tab) {
      requestHandlers.openUrlInCurrentTab({
        url: Clipboard.paste()
      }, tab);
    },
    openCopiedUrlInNewTab: function(tab, count) {
      openMultiTab(Utils.convertToUrl(Clipboard.paste()), tab.index + 1, count, tab.windowId);
    },
    togglePinTab: function(tab) {
      chrome.tabs.update(tab.id, {
        pinned: !tab.pinned
      });
    },
    reloadTab: function(tab) {
      chrome.tabs.update(tab.id, {
        url: tab.url
      });
    },
    showHelp: function(_0, _1, _2, port) {
      port.postMessage({
        name: "toggleHelpDialog",
        dialogHtml: root.helpDialogHtml(),
      });
    },
    moveTabLeft: function(tab, count) {
      moveTab(tab, -count);
    },
    moveTabRight: function(tab, count) {
      moveTab(tab, count);
    },
    nextFrame: function(tab, count, frameId, port) {
      var tabId = port.sender.tab.id, frames = frameIdsForTab[tabId];
      if (!frames) { return; }
      count = (count + Math.max(0, frames.indexOf(frameId))) % frames.length;
      frames = frameIdsForTab[tabId] = frames.slice(count).concat(frames.slice(0, count));
      chrome.tabs.sendMessage(tab.id, {
        name: "focusFrame",
        frameId: frames[0],
        highlight: true
      });
    },
    closeTabsOnLeft: function(tab) {
      removeTabsRelative(tab, -1);
    },
    closeTabsOnRight: function(tab) {
      removeTabsRelative(tab, 1);
    },
    closeOtherTabs: function(tab) {
      removeTabsRelative(tab, 0);
    }
  };

  removeTabsRelative = function(activeTab, direction) {
    chrome.tabs.getAllInWindow(activeTab.windowId, function(tabs) {
      var activeTabIndex, shouldDelete, tab, toRemove, _i, _len;
      activeTabIndex = activeTab.index;
      shouldDelete = (direction === -1) ? function(tab) {
        return !tab.pinned && tab.index < activeTabIndex;
      } : (direction === 1) ? function(tab) {
        return tab.index > activeTabIndex;
      } : (direction === 0) ? function(tab) {
        return !tab.pinned && tab.index !== activeTabIndex;
      } : (direction > 0) ? (direction += activeTabIndex, function(tab) {
        return tab.index >= activeTabIndex && tab.index < direction;
      }) : (direction < 0) ? (direction += activeTabIndex, function(tab) {
        return !tab.pinned && tab.index <= activeTabIndex && tab.index > direction;
      }) : null;
      toRemove = [];
      if (shouldDelete) {
        tabs = tabs.filter(shouldDelete).map(function(tab) {
          return tab.id;
        });
        if (tabs.length > 0) {
          chrome.tabs.remove(tabs);
        }
      }
    });
  };

  moveTab = function(tab, direction) {
    tab.index = Math.max(0, tab.index + direction);
    chrome.tabs.move(tab.id, {
      index: tab.index
    });
  };

  selectTab = function(tab, step) {
    chrome.tabs.getAllInWindow(tab.windowId, function(tabs) {
      if (!(tabs.length > 1)) {
        return;
      }
      var toSelect = tabs[(tab.index + step + tabs.length) % tabs.length];
      chrome.tabs.update(toSelect.id, {
        selected: true
      });
    });
  };

  setBadge = function() {};

  root.setShouldShowActionIcon = !shouldShowActionIcon ? function() {} : (function() {
    var onActiveChanged, currentBadge, badgeTimer, updateBadge, time1 = 50;
    chrome.browserAction.setBadgeBackgroundColor({color: [82, 156, 206, 255]});
    onActiveChanged = function(tabId, selectInfo) {
      chrome.tabs.get(tabId, function(tab) {
        updateActiveState(tabId, tab.url);
      });
    };
    updateBadge = function(badge) {
      badgeTimer = 0;
      chrome.browserAction.setBadgeText({text: badge});
    };
    setBadge = function(request) {
      var badge = request.badge;
      if (badge != null && badge !== currentBadge) {
        currentBadge = badge;
        if (badgeTimer) {
          clearTimeout(badgeTimer);
        }
        badgeTimer = setTimeout(updateBadge.bind(null, badge), time1);
      }
    };
    return function(value) {
      value = chrome.browserAction && chrome.browserAction.setIcon && value ? true : false;
      if (value === shouldShowActionIcon) { return; }
      shouldShowActionIcon = value;
      // TODO: hide icon
      if (shouldShowActionIcon) {
        chrome.tabs.onActiveChanged.addListener(onActiveChanged);
        chrome.browserAction.enable();
      } else {
        chrome.tabs.onActiveChanged.removeListener(onActiveChanged);
        chrome.browserAction.disable();
      }
    };
  })();

  root.updateActiveState = !shouldShowActionIcon ? function() {} : function(tabId, url) {
    if (!shouldShowActionIcon) return;
    chrome.tabs.sendMessage(tabId, {
      name: "getActiveState"
    }, function(response) {
      var config, currentPasskeys, enabled, isCurrentlyEnabled, passKeys;
      if (response) {
        isCurrentlyEnabled = response.enabled;
        currentPasskeys = response.passKeys;
        config = requestHandlers.isEnabledForUrl({ url: url });
        enabled = config.enabled;
        passKeys = config.passKeys;
        chrome.browserAction.setIcon({
          tabId: tabId,
          path: !enabled ? "img/icons/browser_action_disabled.png"
              : passKeys ? "img/icons/browser_action_partial.png"
                         : "img/icons/browser_action_enabled.png"
        })
        if (isCurrentlyEnabled !== enabled || currentPasskeys !== passKeys) {
          chrome.tabs.sendMessage(tabId, {
            name: "setState",
            enabled: enabled,
            passKeys: passKeys
          });
        }
      } else {
        chrome.browserAction.setIcon({
          tabId: tabId,
          path: "img/icons/browser_action_disabled.png"
        });
        return setBadge({badge: ""});
      }
    });
  };

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status !== "loading" || frameIdsForTab[tabId]) {
      return; // topFrame is alive, so loading is caused by may an iframe
    }
    Marks.removeMarksForTab(tabId);
    shouldShowActionIcon && updateActiveState(tabId, tab.url);
  });

  splitKeyIntoFirstAndSecond = function(key) {
    return (key.search(namedKeyRegex) === 0) ? {
      first: RegExp.$1,
      second: RegExp.$2
    } : {
      first: key[0],
      second: key.slice(1)
    };
  };

  getActualKeyStrokeLength = function(key) {
    if (key.search(namedKeyRegex) === 0) {
      return 1 + getActualKeyStrokeLength(RegExp.$2);
    } else {
      return key.length;
    }
  };

  populateKeyCommands = function() {
    var key, len;
    for (key in Commands.keyToCommandRegistry) {
      len = getActualKeyStrokeLength(key);
      if (len === 1) {
        singleKeyCommands.push(key);
      }
      else if (len === 2) {
        validFirstKeys[splitKeyIntoFirstAndSecond(key).first] = true;
      }
      else if (len >= 3) {
        console.warn("3-key command:", key);
      }
    }
  };

  root.refreshCompletionKeysAfterMappingSave = function() {
    validFirstKeys = {};
    singleKeyCommands = [];
    populateKeyCommands();
    sendRequestToAllTabs(getCompletionKeysRequest());
  };

  generateCompletionKeys = function() {
    if (keyQueue.length === 0) {
      return singleKeyCommands;
    }
    var command = splitKeyQueueRegex.exec(keyQueue)[2], completionKeys = singleKeyCommands.slice(0), key, splitKey;
    if (getActualKeyStrokeLength(command) === 1) {
      for (key in Commands.keyToCommandRegistry) {
        splitKey = splitKeyIntoFirstAndSecond(key);
        if (splitKey.first === command) {
          completionKeys.push(splitKey.second);
        }
      }
    }
    return completionKeys;
  };

  splitKeyQueueRegex = /([1-9][0-9]*)?(.*)/;

  handleResponse = function(msgId, func, request, tab) {
    postResponse(this, msgId, func.call(this, request, tab));
  };
  
  postResponse = function(port, msgId, response) {
    port.postMessage({_msgId: msgId, response: response});
  };

  handleMainPort = function(request, port) {
    var key, func, msgId;
    if (msgId = request._msgId) {
      request = request.request;
      if (key = request.handler) {
        if (func = requestHandlers[key]) {
          if (func.useTab) {
            chrome.tabs.getSelected(null, handleResponse.bind(port, msgId, func, request));
          } else {
            postResponse(port, msgId, func.call(port, request));
          }
        } else {
          postResponse(port, msgId);
        }
      }
      else if (key = request.handlerOmni) {
        func = getMultiCompleter(key);
        key = request.query;
        func.filter(key ? key.split(" ") : [], postResponse.bind(null, port, msgId));
      }
    }
    else if (key = request.handlerKey) {
      if (key === "<esc>") {
        key = "";
      } else {
        key = checkKeyQueue(keyQueue + key, port, request.frameId);
      }
      if (keyQueue !== key) {
        keyQueue = key;
        port.postMessage(getCompletionKeysRequest());
      }
    }
    else if (key = request.handler) {
      if (func = requestHandlers[key]) {
        func.useTab ? chrome.tabs.getSelected(null, func.bind(port, request)) : func.call(port, request);
      }
    }
    else if (key = request.handlerSettings) {
      if (key === "get") {
        for (var i = 0, ref = request.keys, values = new Array(ref.length); i < ref.length; i++) {
          values[i] = Settings.get(ref[i]);
        }
        port.postMessage({
          name: "settings",
          values: values,
          response: (request = request.request) && (func = requestHandlers[request.handler])
            && !func.useTab && func.call(port, request)
        });
      } else if (key === "set") {
        Settings.set(request.key, request.value);
      } else if (key === "unreg") {
        unregisterFrame(request, port.sender.tab.id);
      } else if (key === "rereg") {
        reRegisterFrame(request, port);
      }
    }
  };

  checkKeyQueue = function(keysToCheck, port, frameId) {
    var command, count, newKeyQueue, registryEntry, runCommand, splitHash, splitKey;
    splitHash = splitKeyQueueRegex.exec(keysToCheck);
    command = splitHash[2];
    count = parseInt(splitHash[1], 10);
    if (command.length === 0) {
      return keysToCheck;
    }
    if (isNaN(count)) {
      count = 1;
    }
    if (Commands.keyToCommandRegistry[command]) {
      registryEntry = Commands.keyToCommandRegistry[command];
      runCommand = true;
      if (registryEntry.noRepeat === true) {
        count = 1;
      } else if (registryEntry.noRepeat > 0 && count > registryEntry.noRepeat) {
        runCommand = confirm("You have asked Vimium to perform " + count + " repeats of the command:\n\t"
          + Commands.availableCommands[registryEntry.command].description
          + "\n\nAre you sure you want to continue?");
      }
      if (runCommand) {
        if (registryEntry.isBackgroundCommand) {
          chrome.tabs.getSelected(null, function(tab) {
            BackgroundCommands[registryEntry.command](tab, count, frameId, port);
          });
        } else {
          port.postMessage({
            name: "executePageCommand",
            command: registryEntry.command,
            frameId: frameId,
            count: (registryEntry.noRepeat === false) ? (-count) : count,
            keyQueue: "",
            completionKeys: generateCompletionKeys()
          });
          return keyQueue = "";
        }
      }
      newKeyQueue = "";
    } else if (getActualKeyStrokeLength(command) > 1) {
      splitKey = splitKeyIntoFirstAndSecond(command);
      if (Commands.keyToCommandRegistry[splitKey.second]) {
        newKeyQueue = checkKeyQueue(splitKey.second, port, frameId);
      } else {
        newKeyQueue = (validFirstKeys[splitKey.second] ? splitKey.second : "");
      }
    } else {
      newKeyQueue = (validFirstKeys[command] ? count.toString() + command : "");
    }
    return newKeyQueue;
  };

  sendRequestToAllTabs = function (args) {
    chrome.windows.getAll({
      populate: true
    }, function(windows) {
      var _i, _len, _j, _len1, _ref;
      for (_i = 0, _len = windows.length; _i < _len; _i++) {
        if (windows[_i].type !== "normal") {
          continue;
        }
        _ref = windows[_i].tabs;
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          chrome.tabs.sendMessage(_ref[_j].id, args, null);
        }
      }
    });
  };

  registerFrame = function(request, tab) {
    var tabId = tab.id, css2;
    this.sender.tab.id = tabId;
    if (! isNaN(request.frameId)) {
      (frameIdsForTab[tabId] || (frameIdsForTab[tabId] = [])).push(request.frameId);
    }
    css2 = Settings.get("userDefinedCss");
    css2 && chrome.tabs.insertCSS(tabId, {
      allFrames: true,
      code: css2
    }, function() {
      // chrome.runtime.lastError && console.log("%c" + chrome.runtime.lastError.message, "color: red");
      return chrome.runtime.lastError;
    });
    if (shouldShowUpgradeMessage) {
      this.postMessage({
        name: "showUpgradeNotification",
        version: currentVersion
      });
    }
  };

  unregisterFrame = function(request, tabId) {
    var j, ref2;
    if (!(ref2 = frameIdsForTab[tabId])) {
      return;
    }
    if (request.isTop) {
      delete frameIdsForTab[tabId];
    } else if (ref2.length >= 1) {
      j = ref2.indexOf(request.frameId);
      if (j === ref2.length - 1) {
        ref2.pop();
      } else if (j >= 0) {
        ref2.splice(j, 1);
      }
    }
  };
  
  reRegisterFrame = function(request, port) {
    var tabId = port.sender.tab.id;
    if (! isNaN(request.frameId)) {
      (frameIdsForTab[tabId] || (frameIdsForTab[tabId] = [])).push(request.frameId);
    }
    if (shouldShowUpgradeMessage) {
      port.postMessage({
        name: "showUpgradeNotification",
        version: currentVersion
      });
    }
  };

  // function Port::* (request, Tab tab) const;
  requestHandlers = {
    getCurrentTabUrl: function(_0, tab) {
      return tab.url;
    },
    openUrlInNewTab: function(request, tab) {
      openMultiTab(Utils.convertToUrl(request.url), tab.index + 1, 1, tab.windowId);
    },
    restoreSession: function(request) {
      BackgroundCommands.restoreTab(null, 1, null, null, request.sessionId);
    },
    openUrlInIncognito: function(request, tab) {
      chrome.windows.getAll(function(wnds) {
        wnds = wnds.filter(function(wnd) {
          return wnd.incognito && wnd.type === "normal";
        });
        request.active = (request.active !== false);
        if (wnds.length >= 1) {
          var inCurWnd = wnds.filter(function(wnd) {
            return wnd.id === tab.windowId
          }).length >= 0, options = {
            url: request.url,
            windowId: inCurWnd ? tab.windowId : wnds[wnds.length - 1].id,
            selected: request.active
          };
          if (inCurWnd) {
            options.index = tab.index + 1;
          }
          chrome.tabs.create(options);
          if (request.active && !inCurWnd) {
            chrome.windows.update(request.windowId, {
              focused: true
            });
          }
        } else {
          chrome.windows.create({
            type: "normal",
            url: Utils.convertToUrl(request.url),
            incognito: true
          });
          if (request.active) {
            chrome.windows.update(tab.windowId, {
              focused: true
            });
          }
        }
      });
    },
    openUrlInCurrentTab: function(request, tab) {
      chrome.tabs.update(tab.id, {
        url: Utils.convertToUrl(request.url)
      });
    },
    openOptionsPageInNewTab: function(_0, tab) {
      openMultiTab(chrome.runtime.getURL("pages/options.html"), tab.index + 1, 1, tab.windowId);
    },
    registerFrame: registerFrame,
    frameFocused: function(request) {
      var frames = frameIdsForTab[this.sender.tab.id], ind;
      if (frames && frames.length > 1 && (ind = frames.indexOf(request.frameId)) > 0) {
        frames.splice(ind, 1);
        frames.unshift(request.frameId);
      }
    },
    nextFrame: function(request, tab) {
      BackgroundCommands.nextFrame(tab, 1, request.frameId);
    },
    initVomnibar: function() {
      return filesContent.vomnibar;
    },
    upgradeNotificationClosed: function(request) {
      Settings.set("previousVersion", currentVersion);
      shouldShowUpgradeMessage = false;
      sendRequestToAllTabs({ name: "hideUpgradeNotification" });
    },
    copyToClipboard: function(request) {
      Clipboard.copy(request.data);
    },
    isEnabledForUrl: function(request) {
      var rule = Exclusions.getRule(request.url), ret;
      if (rule && !rule.passKeys) {
        return { enabled: false };
      } else {
        ret = getCompletionKeysRequest();
        ret.enabled = true;
        ret.passKeys = rule ? rule.passKeys : ""
        delete ret.name;
        return ret;
      }
    },
    saveHelpDialogSettings: function(request) {
      Settings.set("helpDialog_showAdvancedCommands", request.showAdvancedCommands);
    },
    selectSpecificTab: function(request) {
      chrome.tabs.get(request.sessionId, function(tab) {
        chrome.windows.update(tab.windowId, { focused: true });
        chrome.tabs.update(request.sessionId, { selected: true });
      });
    },
    refreshCompleter: function(request) {
      getMultiCompleter(request.omni).refresh();
    },
    setBadge: setBadge,
    createMark: Marks.create.bind(Marks),
    gotoMark: Marks.goTo.bind(Marks)
  };

  Commands.clearKeyMappingsAndSetDefaults();
  if (Settings.has("keyMappings")) {
    Commands.parseCustomKeyMappings(Settings.get("keyMappings"));
  }
  populateKeyCommands();
  
  Settings.parseSearchEngines(Settings.get("searchEngines"));

  shouldShowActionIcon = false;
  root.setShouldShowActionIcon(Settings.get("showActionIcon") === true);

  (function() {
    var ref, i, key, url, callback;
    ref = ["getCurrentTabUrl", "openUrlInNewTab", "openUrlInIncognito", "openUrlInCurrentTab" //
      , "openOptionsPageInNewTab", "registerFrame", "nextFrame", "createMark" //
    ];
    for (i = ref.length; 0 <= --i; ) {
      requestHandlers[ref[i]].useTab = true;
    }
    
    key = Settings.get("previousVersion");
    if (!key) {
      Settings.set("previousVersion", currentVersion);
      shouldShowUpgradeMessage = false;
    } else {
      shouldShowUpgradeMessage = (Utils.compareVersions(currentVersion, key) === 1);
    }

    sendRequestToAllTabs({
      name: "reRegisterFrame"
    });

    ref = filesContent;
    callback = function(key, content, code) {
      if (code === 200) {
        this[key] = content;
      } else {
        console.groupCollapsed("filesContent.statusCode %c[" + key + "]: " + code, "color:red; font-weight:normal;");
        console.log("\t%cbody: ", "color: blue;", content);
        console.groupEnd();
      }
    };
    for (key in ref) {
      url = chrome.runtime.getURL(ref[key]);
      ref[key] = "";
      fetchHttpContents(url, callback.bind(ref, key));
    }

    if (typeof Sync === "object" && typeof Sync.init === "function" && Settings.get("vimSync") === true) {
      Sync.init();
    } else {
      var blank = function() {};
      root.Sync = {debug: false, clear: blank, set: blank, init: blank};
    }
  })();

})();
