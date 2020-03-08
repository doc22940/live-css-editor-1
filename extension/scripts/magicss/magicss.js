/* global jQuery, less, utils, sourceMap, chrome, CodeMirror, io, toastr, extLib */

// TODO: Remove turning off of this rule (require-atomic-updates)
/* eslint require-atomic-updates: "off" */

/*! https://webextensions.org/ by Priyank Parashar | MIT license */

// TODO: Share constants across files (like magicss.js, editor.js and options.js) (probably keep them in a separate file as global variables)
var USER_PREFERENCE_AUTOCOMPLETE_SELECTORS = 'autocomplete-css-selectors',
    USER_PREFERENCE_AUTOCOMPLETE_CSS_PROPERTIES_AND_VALUES = 'autocomplete-css-properties-and-values',
    // USER_PREFERENCE_USE_CUSTOM_FONT_SIZE = 'use-custom-font-size',
    USER_PREFERENCE_FONT_SIZE_IN_PX = 'font-size-in-px',
    USER_PREFERENCE_HIDE_ON_PAGE_MOUSEOUT = 'hide-on-page-mouseout';

var const_rateUsUsageCounterFrom = 20,
    const_rateUsUsageCounterTo = 100;

(function($){
    var asyncTimeout = function (delay) {
        return new Promise((resolve) => {
            setTimeout(resolve, delay);
        });
    };

    var flagConnectedAtLeastOnce = false;
    window.currentlyConnected = false;
    var setCurrentlyConnected = function (value) {
        window.currentlyConnected = value;
    };

    var socketOb = {};
    window.socketOb = socketOb;

    socketOb.socket = null;
    socketOb.flagWatchingCssFiles = false;

    socketOb.setup = async function (asyncCallbackOnce) {
        var $backEndConnectivityOptions = window.$backEndConnectivityOptions;
        var editor = window.MagiCSSEditor;

        var serverHostnameValue = await editor.userPreference('live-css-server-hostname') || constants.liveCssServer.defaultHostname,
            serverPortValue = await editor.userPreference('live-css-server-port') || constants.liveCssServer.defaultPort;

        var backEndPath = serverHostnameValue + ':' + serverPortValue + constants.liveCssServer.apiVersionPath;
        var backEndPathToShowToUser = serverHostnameValue + ':' + serverPortValue;

        socketOb.socket = io(backEndPath, {
            timeout: 3000
        });
        var socket = socketOb.socket;

        socket.on('disconnect', function () {
            editor.markLiveCssServerConnectionStatus(false);
        });

        socket.on('connect', async function () {
            // This callback may lead to opening the "File to edit" input form. We wouldn't want it
            // to open again everytime disconnection / connection happens, due to some intermittent
            // issues like manual disconnection or network/debugging related causes.
            if (asyncCallbackOnce && !asyncCallbackOnce.alreadyCalled) {
                asyncCallbackOnce.alreadyCalled = true;
                await asyncCallbackOnce();
            }

            editor.markLiveCssServerConnectionStatus(true);

            setCurrentlyConnected(true);

            if ($backEndConnectivityOptions) {
                $backEndConnectivityOptions
                    .removeClass('live-css-server-client-general-error')
                    .removeClass('live-css-server-client-incompatible-error')
                    .find('.magic-css-server-connectivity-status')
                    .removeClass('disconnected')
                    .removeClass('connecting')
                    .addClass('connected');
            }

            flagConnectedAtLeastOnce = true;

            if ($toastrReconnectAttempt) {
                $toastrReconnectAttempt.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
                $toastrReconnectAttempt = null;
            }

            $toastrConnecting.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
            $toastrConnected = toastr.success(
                '<div style="display:block; text-align:center; margin-top:3px; margin-bottom:15px; font-weight:bold;">' +
                    backEndPathToShowToUser +
                '</div>' +
                '<div>' +
                '<button type="button" class="magic-css-toastr-socket-ok" style="float:right;">OK</button>' +
                    '<button type="button" class="magic-css-toastr-socket-configure">Settings</button>' +
                '</div>',
                'Connected with live-css server at:',
                {
                    onclick: async function (evt) {
                        if ($(evt.target).hasClass('magic-css-toastr-socket-configure')) {
                            toastr.clear($toastrConnected, {force: true});

                            // TODO: Verify functionality
                            await _getServerDetailsFromUser(editor);
                        } else if ($(evt.target).hasClass('magic-css-toastr-socket-ok')) {
                            toastr.clear($toastrConnected, {force: true});
                        }
                    }
                }
            );
            var $toastrToHide = $toastrConnected;
            setTimeout(function () {
                toastr.clear($toastrToHide);
            }, 4000);
        });

        var errorHandler = function (err) {
            setCurrentlyConnected(false);

            editor.markLiveCssServerConnectionStatus(false);

            if ($backEndConnectivityOptions) {
                $backEndConnectivityOptions
                    .find('.magic-css-server-connectivity-status')
                    .removeClass('connected')
                    .removeClass('connecting')
                    .addClass('disconnected');

                if (err === 'Invalid namespace') {
                    $backEndConnectivityOptions
                        .removeClass('live-css-server-client-general-error')
                        .addClass('live-css-server-client-incompatible-error');
                } else {
                    $backEndConnectivityOptions
                        .removeClass('live-css-server-client-incompatible-error')
                        .addClass('live-css-server-client-general-error');
                }
                // $backEndConnectivityOptions.find('.magicss-done-server-path-changes').prop('disabled', true);
            }
        };

        socket.on('connect_error', errorHandler);
        socket.on('error', errorHandler);  // This would pass on the "Invalid namespace" error

        socket.on('reconnect_attempt', function () {
            setCurrentlyConnected(false);

            editor.markLiveCssServerConnectionStatus(false);

            if (flagConnectedAtLeastOnce) {
                if ($toastrReconnectAttempt) {
                    // do nothing
                } else {
                    if ($toastrConnected) {
                        $toastrConnected.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
                    }
                    $toastrReconnectAttempt = toastr.warning(
                        '<div style="display:block; text-align:center; margin-top:3px; margin-bottom:15px; font-weight:bold;">' +
                            backEndPathToShowToUser +
                        '</div>' +
                        '<div>' +
                            '<button type="button" class="magic-css-toastr-socket-cancel" style="float:right">Cancel</button>' +
                            '<button type="button" class="magic-css-toastr-socket-configure">Settings</button>' +
                        '</div>',
                        'Reconnecting with live-css server at:',
                        {
                            timeOut: 0,
                            onclick: function (evt) {
                                if ($(evt.target).hasClass('magic-css-toastr-socket-configure')) {
                                    // TODO: Verify functionality
                                    _getServerDetailsFromUser(editor);
                                } else if ($(evt.target).hasClass('magic-css-toastr-socket-cancel')) {
                                    if (socket) {
                                        editor.markLiveCssServerConnectionStatus(false);

                                        socket.close();
                                        socket = null;
                                    }
                                    toastr.clear($toastrReconnectAttempt, {force: true});
                                    liveCssServerSessionClosedByUser(editor);
                                }
                            }
                        }
                    );
                }
            }
        });

        socket.on('file-modified', function(changeDetails) {
            if (socketOb && socketOb.flagWatchingCssFiles) {
                if (changeDetails.useOnlyFileNamesForMatch) {
                    reloadCSSResourceInPage({
                        fullPath: changeDetails.fullPath,
                        useOnlyFileNamesForMatch: true,
                        fileName: changeDetails.fileName
                    });
                } else if (changeDetails.fullPath.indexOf(changeDetails.root) === 0) {
                    var pathWrtRoot = changeDetails.fullPath.substr(changeDetails.root.length);
                    reloadCSSResourceInPage({
                        fullPath: changeDetails.fullPath,
                        url: resolveUrl(pathWrtRoot)
                    });
                } else {
                    // The code should never reach here
                    utils.alertNote(
                        'Unexpected scenario occurred in reloading some CSS resources.' +
                        '<br />Please report this bug at <a href="https://github.com/webextensions/live-css-editor/issues">https://github.com/webextensions/live-css-editor/issues</a>',
                        10000
                    );
                }
            }
        });
    };

    socketOb.close = function () {
        if (socketOb.socket) {
            socketOb.socket.close();
            socketOb.socket = null;
        }
    };

    socketOb.reset = async function (asyncCallbackOnce) {
        socketOb.close();
        await socketOb.setup(asyncCallbackOnce);
    };

    socketOb._connectServerHelper = async function (editor, asyncCb) {
        await _getConnectedWithBackEnd(
            editor,
            async function () {
                await asyncCb();
            }
        );
    };
    socketOb._disconnectIfRequiredServerHelper = async function () {
        if (socketOb.flagWatchingCssFiles || socketOb.flagEditingFile) {
            // do nothing
        } else {
            socketOb.close();
        }
    };
    socketOb.getConnected = async function (editor, asyncCb) {
        var socketIfAlreadyConnected = await _getConnectedWithBackEnd(
            editor,
            async function callback (err) {
                if (err) {
                    // The user cancelled watching files
                    utils.alertNote('You cancelled watching CSS files for changes');
                    await editor.userPreference('watching-css-files', 'no');
                } else {
                    // TODO: This code is duplicated elsewhere
                    if (!socketOb.flagWatchingCssFiles) {
                        socketOb.flagWatchingCssFiles = true;
                        utils.alertNote(
                            'Watching CSS files for changes.' +
                            '<br />' +
                            '<span style="font-weight:normal;">When a file gets saved, live-css server notifies Magic CSS to reload the CSS file\'s &lt;link&gt; tag.</span>',
                            20000,
                            {
                                unobtrusive: true
                            }
                        );
                        $(editor.container).addClass('watching-css-files');
                        editor.adjustUiPosition();
                        await editor.userPreference('watching-css-files', 'yes');
                    }

                    if (!socketIfAlreadyConnected && asyncCb) {
                        await asyncCb();
                    }
                }
            }
        );
        if (socketIfAlreadyConnected) {
            if (asyncCb) {
                await asyncCb();
            }

            // TODO: This code is duplicated elsewhere
            if (!socketOb.flagWatchingCssFiles) {
                socketOb.flagWatchingCssFiles = true;
                utils.alertNote(
                    'Watching CSS files for changes.' +
                    '<br />' +
                    '<span style="font-weight:normal;">When a file gets saved, live-css server notifies Magic CSS to reload the CSS file\'s &lt;link&gt; tag.</span>',
                    20000,
                    {
                        unobtrusive: true
                    }
                );
                $(editor.container).addClass('watching-css-files');
                editor.adjustUiPosition();
                await editor.userPreference('watching-css-files', 'yes');
            }
        }
    };

    socketOb._startWatchingFiles = async function (editor) {
        if (!socketOb.flagWatchingCssFiles) {
            await socketOb._connectServerHelper(editor, async function () {
                if (!socketOb.flagWatchingCssFiles) {
                    socketOb.flagWatchingCssFiles = true;
                    utils.alertNote(
                        'Watching CSS files for changes.' +
                        '<br />' +
                        '<span style="font-weight:normal;">When a file gets saved, live-css server notifies Magic CSS to reload the CSS file\'s &lt;link&gt; tag.</span>',
                        20000,
                        {
                            unobtrusive: true
                        }
                    );
                    $(editor.container).addClass('watching-css-files');
                    editor.adjustUiPosition();
                    await editor.userPreference('watching-css-files', 'yes');
                }
            });
        }
    };

    socketOb._updateUiMentioningNotWatchingCssFiles = async function (editor, asyncCallback) {
        if (socketOb.flagWatchingCssFiles) {
            socketOb.flagWatchingCssFiles = false;
            utils.alertNote('Stopped watching CSS files for changes');
            $(editor.container).removeClass('watching-css-files');
            editor.adjustUiPosition();
            await editor.userPreference('watching-css-files', 'no');
        }
        if (asyncCallback) {
            await asyncCallback();
        }
    };

    socketOb._stopWatchingFiles = async function (editor) {
        await socketOb._updateUiMentioningNotWatchingCssFiles(editor, async function () {
            await socketOb._disconnectIfRequiredServerHelper();
        });
    };

    var chromeStorageForExtensionData = chrome.storage.sync || chrome.storage.local;

    var checkIfMagicCssLoadedFine = function (MagiCSSEditor) {
        if (!MagiCSSEditor.container.clientHeight) {
            // Cases where this condition would be true:
            //     - When the <body> element itself is implemented as shadow-dom. eg: http://www.firstpost.com (when this change was initially added)
            //     - If the user tries to use following CSS via this extension: #MagiCSS-bookmarklet {display: none !important;}
            utils.alertNote(
                'Error: Unable to load Magic CSS properly' +
                '<br/>Kindly report this issue at <a target="_blank" href="https://github.com/webextensions/live-css-editor/issues">GitHub repository for Magic CSS</a>',
                10000
            );
        }
    };

    var strAboutToBeInstantiated = '<about-to-be-instantiated>';
    if (window.MagiCSSEditor) {
        if (window.MagiCSSEditor === strAboutToBeInstantiated) {
            // do nothing
        } else {
            utils.alertNote.hide();     // Hide the note which says that Magic CSS is loading

            setTimeout(async function () {
                // 'Magic CSS window is already there. Repositioning it.'
                await window.MagiCSSEditor.reposition(function () {
                    checkIfMagicCssLoadedFine(window.MagiCSSEditor);
                });
            });
        }
        return;
    } else {
        // Temporarily instantiating window.MagiCSSEditor as a truthy value
        // Without this, if a user quickly runs Magic CSS twice, then in both
        // the runs, window.MagiCSSEditor would be unavailable
        window.MagiCSSEditor = strAboutToBeInstantiated;
    }

    /* eslint-disable */
    // TODO: Move this functionality into utils.js
    // https://github.com/lydell/resolve-url/blob/master/resolve-url.js
    // Copyright 2014 Simon Lydell
    // X11 (“MIT”) Licensed. (See LICENSE.)
    function resolveUrl( /* ...urls */ ) {
        var numUrls = arguments.length

        if (numUrls === 0) {
            throw new Error("resolveUrl requires at least one argument; got none.")
        }

        var base = document.createElement("base")
        base.href = arguments[0]

        if (numUrls === 1) {
            return base.href
        }

        var head = document.getElementsByTagName("head")[0]
        head.insertBefore(base, head.firstChild)

        var a = document.createElement("a")
        var resolved

        for (var index = 1; index < numUrls; index++) {
            a.href = arguments[index]
            resolved = a.href
            base.href = resolved
        }

        head.removeChild(base)

        return resolved
    }
    /* eslint-enable */

    // for HTML frameset pages, this value would be 'FRAMESET'
    // chrome.tabs.executeScript uses allFrames: true, to run inside all frames
    if (document.body.tagName !== 'BODY') {
        return;
    }

    var constants = {};
    try {
        constants.appVersion = chrome.runtime.getManifest().version;
    } catch (e) {
        // Just being cautious to have a fallback.
        // In future, we may adopt just one of these two approaches to get the
        // version number, once stability is proven across platforms and environments.
        constants.appVersion = window.magicCssVersion;
    }
    constants.appMajorVersion = parseInt(constants.appVersion, 10);
    constants.liveCssServer = {
        defaultProtocol: (window.location.protocol === 'https:') ? 'https:' : 'http:',
        defaultHostname: window.location.hostname || '127.0.0.1',
        defaultPort: '3456',
        apiVersionPath: '/api/v' + constants.appMajorVersion
    };

    toastr.options.positionClass = 'toast-top-right magic-css-toastr magic-css-ui';
    toastr.options.newestOnTop = false;
    // toastr.options.closeButton = true;
    toastr.options.hideDuration = 300;
    toastr.options.timeOut = 5000;
    toastr.options.extendedTimeOut = 0;
    // toastr.options.tapToDismiss = false;

    var rememberLastAppliedCss = async function (css) {
        var editor = window.MagiCSSEditor;
        await editor.userPreference('last-applied-css', css);
    };

    var applyLastAppliedCss = async function (editor) {
        // TODO: Some of the code related to this function may be reused

        var userPreference = editor.userPreference.bind(editor);

        var localStorageDisableStyles = 'disable-styles';
        var disableStyles = await userPreference(localStorageDisableStyles) === 'yes';

        var localStorageLastAppliedCss = 'last-applied-css';
        var cssText = (await userPreference(localStorageLastAppliedCss)).trim();

        if (cssText) {
            var id = 'MagiCSS-bookmarklet',
                newStyleTagId = id + '-html-id',
                newStyleTag = new utils.StyleTag({
                    id: newStyleTagId,
                    parentTag: 'body',
                    attributes: [{
                        name: 'data-style-created-by',
                        value: 'magicss'
                    }],
                    overwriteExistingStyleTagWithSameId: true
                });

            newStyleTag.cssText = cssText;

            newStyleTag.disabled = disableStyles;
            newStyleTag.applyTag();
        }
    };

    var ellipsis = function (str, limit) {
        limit = limit || 12;
        return (str.length <= limit) ? str : (str.substring(0, limit - 3) + '...');
    };

    var getLocalISOTime = function () {
        // http://stackoverflow.com/questions/10830357/javascript-toisostring-ignores-timezone-offset/28149561#28149561
        var tzoffset = (new Date()).getTimezoneOffset() * 60000, //offset in milliseconds
            localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0,-1);
        localISOTime = localISOTime.replace('T', '_');
        return localISOTime;
    };

    var getActiveStylesheetLinkTags = function (options) {
        options = options || {};
        // The disabled <link> tags are not loaded when "href" is changed, so don't include them
        var linkTags = $('link[rel~="stylesheet"]:not([disabled])').filter(function () {
            if (this.reloadingActiveWithMagicCSS) {
                return false;
            }
            // Don't include the elements which don't have a value set for "href"
            if (!$(this).attr('href')) {
                return false;
            }
            if (!options.skipIntegrityCheck) {
                // Don't include the elements which have a value set for "integrity"
                if ($(this).attr('integrity')) {
                    return false;
                }
            }
            return true;
        }).toArray();

        return linkTags;
    };

    var getFileNameFromPath = function (path) {
        path = path.split('?')[0];
        path = path.split('#')[0];
        path = path.split('/').pop();
        return path;
    };

    var findProbableMatchElementIndexes = function (arr, useOnlyFileNamesForMatch, itemToMatch) {
        var fileNameOfItemToMatch = getFileNameFromPath(itemToMatch);
        var matchedIndexes = [];
        arr.forEach(function (item, index) {
            item = item.replace(/[?&]reloadedAt=[\d-_:.]+/, '');
            if (useOnlyFileNamesForMatch) {
                if (getFileNameFromPath(item) === fileNameOfItemToMatch) {
                    matchedIndexes.push(index);
                }
            } else {
                if (resolveUrl(item) === itemToMatch) {
                    matchedIndexes.push(index);
                }
            }
        });
        return matchedIndexes;
    };

    var reloadCSSResourceInPage = function (config) {
        var useOnlyFileNamesForMatch = config.useOnlyFileNamesForMatch,
            fileName = config.fileName,
            fullUrl = config.url,
            fullPath = config.fullPath;

        var activeLinkTagsSkipIntegrityCheck = getActiveStylesheetLinkTags({skipIntegrityCheck: true});

        var arrLinkTags = [];
        activeLinkTagsSkipIntegrityCheck.forEach(function (linkTag) {
            arrLinkTags.push($(linkTag).attr('href'));
        });

        var indexes = findProbableMatchElementIndexes(
            arrLinkTags,
            useOnlyFileNamesForMatch,
            useOnlyFileNamesForMatch ? fileName : fullUrl
        );

        var linkTagsToReload = [];
        var linkTagsNotToReloadBecauseOfIntegrityAttribute = 0;
        indexes.forEach(function (index) {
            if (activeLinkTagsSkipIntegrityCheck[index].getAttribute('integrity')) {
                linkTagsNotToReloadBecauseOfIntegrityAttribute += 1;
            } else {
                linkTagsToReload.push(activeLinkTagsSkipIntegrityCheck[index]);
            }
        });
        if (linkTagsNotToReloadBecauseOfIntegrityAttribute) {
            console.log('Note: Magic CSS will not attempt to reload the link tags which use "integrity" attribute.');
        }
        reloadPassedLinkTags(linkTagsToReload, {
            noMatchesPrepend: 'Modified: <span style="font-weight:normal">' + (function (str) {
                if (str.length >= 53) {
                    return '...' + str.substr(-50);
                } else {
                    return str;
                }
            }(fullPath)) +
            '</span>'
        });
    };

    // https://developer.mozilla.org/en-US/docs/Web/API/Element/getAttributeNames
    // Polyfill required for Microsoft Edge (eg: Microsoft Edge version 38.14393.0.0 needs the polyfill)
    if (Element.prototype.getAttributeNames == undefined) {
        Element.prototype.getAttributeNames = function () {
            var attributes = this.attributes;
            var length = attributes.length;
            var result = new Array(length);
            for (var i = 0; i < length; i++) {
                result[i] = attributes[i].name;
            }
            return result;
        };
    }

    var recreateNodeCustomized = function (node, options) {
        options = options || {};
        var skipAttributes = options.skipAttributes || [];

        var nodeName = node.nodeName;
        var recreatedNode = document.createElement(nodeName);

        node.getAttributeNames().forEach(function (attributeName) {
            if (skipAttributes.indexOf(attributeName) === -1) {
                var attributeValue = node.getAttribute(attributeName);
                recreatedNode.setAttribute(attributeName, attributeValue);
            }
        });

        return recreatedNode;
    };

    var reloadPassedLinkTags = function (linkTags, extraInfo) {
        var localISOTime = getLocalISOTime();

        var successCount = 0,
            errorCount = 0;
        var checkCompletion = function () {
            utils.alertNote(
                '<span style="font-weight:normal;">' +
                    htmlEscape('Reloading active CSS <link> tags.') +
                '</span>' +
                ' Success: ' + successCount + '/' + linkTags.length
            );
            if (linkTags.length === successCount + errorCount) {
                setTimeout(function () {
                    if (errorCount) {
                        var msg = '';
                        if (errorCount === 1) {
                            msg = htmlEscape(errorCount + ' of the CSS <link> tag failed to reload.');
                        } else {
                            msg = htmlEscape(errorCount + ' of the CSS <link> tags failed to reload.');
                        }
                        msg += '<br/><span style="font-weight:normal;">Please check availability of the CSS resources included in this page.</span>';
                        utils.alertNote(
                            msg,
                            undefined,
                            {
                                backgroundColor: '#f5bcae',
                                borderColor: '#e87457'
                            }
                        );
                    } else {
                        if (successCount === 1) {
                            utils.alertNote(htmlEscape(successCount + ' active CSS <link> tag got reloaded successfully :-)'));
                        } else {
                            utils.alertNote(htmlEscape(successCount + ' active CSS <link> tags got reloaded successfully :-)'));
                        }
                    }
                }, 750);

                var tagsToExclude = jQuery.makeArray(jQuery('[data-style-created-by="magicss"]'));
                updateExistingCSSSelectorsAndAutocomplete(tagsToExclude);
            }
        };
        if (linkTags.length) {
            checkCompletion();
            linkTags.forEach(function (linkTag) {
                var link = linkTag,
                    $link = $(link),
                    href = $link.attr('href');
                if (href.indexOf('reloadedAt=') >= 0) {
                    href = href.replace(/[?&]reloadedAt=[\d-_:.]+/, '');
                }
                var newHref;
                if (href.indexOf('?') >= 0) {
                    newHref = href + '&reloadedAt=' + localISOTime;
                } else {
                    newHref = href + '?reloadedAt=' + localISOTime;
                }

                // For Edge extension, cloning the element seems to result in some form of CORS request which wouldn't work.
                // Hence, we recreate the element without the 'href' attribute and assign the 'href' later after inserting
                // that element in the DOM.
                var newLink = recreateNodeCustomized(link, { skipAttributes: ['href'] }),
                    $newLink = $(newLink);

                newLink.reloadingActiveWithMagicCSS = true;
                link.reloadingActiveWithMagicCSS = true;

                $link.after($newLink);

                // Note:
                //     Apparently, in Microsoft Edge, onload gets fired even if the CSS resource end with a 404 page.
                //     The failure seems to be undetectable.
                //     A workaround can be attempted (reference: https://stackoverflow.com/questions/30171270/link-onerror-do-not-work-in-ie/43357862#43357862).
                //     Note that this workaround would not work perfectly for all possible scenarios (for example if the stylesheet contains no CSS styles).
                var didLinkTagLoadSuccessfully = function (linkTag) {
                    var cssRules;
                    try {
                        cssRules = linkTag.sheet && linkTag.sheet.cssRules;
                    } catch (e) {
                        cssRules = { length: 0 };
                    }

                    if (cssRules && cssRules.length) {
                        return true;
                    } else {
                        return false;
                    }
                };

                newLink.onload = function (evt) {   // eslint-disable-line no-unused-vars
                    // There seems to be a bug in Microsoft Edge which makes a CSS file load twice in some scenarios.
                    // Considering that it would be safe to assume that if the first load worked fine,
                    // the second load would also go on to be fine (similarly, if the first load failed, the second one too would fail).
                    // See: https://github.com/filamentgroup/loadCSS/issues/222#issuecomment-306622674
                    if (newLink.onloadAlreadyCalled) {
                        return;
                    } else {
                        newLink.onloadAlreadyCalled = true;

                        delete newLink.reloadingActiveWithMagicCSS;
                        delete link.reloadingActiveWithMagicCSS;

                        var wasSuccessful = true;
                        if (isEdge && !didLinkTagLoadSuccessfully(newLink)) {
                            wasSuccessful = false;
                            console.log(newHref);
                        }

                        if (wasSuccessful) {
                            successCount++;
                            $link.remove();
                        } else {
                            errorCount++;
                            $newLink.remove();
                        }
                        checkCompletion();
                    }
                };
                newLink.onerror = function (evt) {  // eslint-disable-line no-unused-vars
                    delete newLink.reloadingActiveWithMagicCSS;
                    delete link.reloadingActiveWithMagicCSS;
                    $newLink.remove();
                    errorCount++;
                    checkCompletion();
                };

                $newLink.attr('href', newHref);
            });
        } else {
            utils.alertNote(
                ((extraInfo && extraInfo.noMatchesPrepend) ? (extraInfo.noMatchesPrepend + '<br />') : '') +
                htmlEscape('There are no active CSS <link> tags that need to be reloaded.')
            );
        }
    };

    var reloadAllCSSResourcesInPage = function () {
        var linkTags = getActiveStylesheetLinkTags();
        var activeLinkTagsSkipIntegrityCheck = getActiveStylesheetLinkTags({skipIntegrityCheck: true});
        if (linkTags.length !== activeLinkTagsSkipIntegrityCheck.length) {
            console.log('Note: Magic CSS will not attempt to reload the link tags which use "integrity" attribute.');
        }
        reloadPassedLinkTags(linkTags);
    };

    var getExistingCSSSelectors = function (tagsToExclude) {
        tagsToExclude = tagsToExclude || [];
        var selectorsOb = {};
        var handleErrorInReadingCSS = function (e) {
            if (e.name === 'SecurityError') {   // This may happen due to cross-domain CSS resources
                // do nothing
            } else {
                console.log(
                    'If you are seeing this message, it means that Magic CSS extension encountered an unexpected error' +
                    ' when trying to read the list of existing CSS selectors.' +
                    '\n\nDon\'t worry :-) This would not cause any issue at all in usage of this extension.' +
                    ' But we would be glad if you report about this error message at https://github.com/webextensions/live-css-editor/issues' +
                    ' so that we can investigate this minor bug and provide better experience for you and other web developers.'
                );
            }
        };

        try {
            var styleSheets = document.styleSheets;
            var getCSSSelectorsRecursively = function (cssRules, includeMediaTitle) {
                var cssSelectors = [];
                for (var i = 0; i < cssRules.length; i++) {
                    var cssRule = cssRules[i] || {};
                    try {
                        if (cssRule.selectorText) {
                            var selectorsFound = cssRule.selectorText.split(', ');
                            for (var j = 0; j < selectorsFound.length; j++) {
                                // cssSelectors.push(selectorsFound[j]);
                                cssSelectors.push({
                                    selector: selectorsFound[j],
                                    source: cssRule.parentStyleSheet.href ||
                                    (cssRule.parentStyleSheet.ownerNode.tagName === 'STYLE' && '<style> tag') ||
                                    ''
                                });
                            }
                        }
                    } catch (e) {
                        handleErrorInReadingCSS(e);
                    }
                    try {
                        if (includeMediaTitle && cssRule instanceof CSSMediaRule) {
                            cssSelectors.push(cssRule.cssText.substring(0, cssRule.cssText.indexOf('{')).trim());
                        }
                    } catch (e) {
                        handleErrorInReadingCSS(e);
                    }
                    try {
                        if ((cssRule.styleSheet || {}).cssRules) {
                            cssSelectors = cssSelectors.concat(getCSSSelectorsRecursively(cssRule.styleSheet.cssRules, includeMediaTitle));
                        }
                    } catch (e) {
                        handleErrorInReadingCSS(e);
                    }
                    try {
                        if (cssRule.cssRules) {
                            cssSelectors = cssSelectors.concat(getCSSSelectorsRecursively(cssRule.cssRules, includeMediaTitle));
                        }
                    } catch (e) {
                        handleErrorInReadingCSS(e);
                    }
                }
                return cssSelectors;
            };

            for (var i = 0; i < styleSheets.length; i++) {
                var styleSheet = styleSheets[i];

                var shouldTagBeExcluded = tagsToExclude.some(function (tagsToExclude) {
                    if (styleSheet.ownerNode === tagsToExclude) {
                        return true;
                    }
                });
                if (shouldTagBeExcluded) {
                    continue;
                }

                var cssRules;
                try {
                    cssRules = (styleSheet || {}).cssRules;
                } catch (e) {
                    handleErrorInReadingCSS(e);
                }
                cssRules = cssRules || [];

                var cssSelectors = getCSSSelectorsRecursively(cssRules, true);
                cssSelectors.forEach(function (cssSelector) {
                    selectorsOb[cssSelector.selector] = selectorsOb[cssSelector.selector] || [];
                    if (selectorsOb[cssSelector.selector].indexOf(cssSelector.source) === -1) {
                        selectorsOb[cssSelector.selector].push(cssSelector.source);
                    }
                });
            }
        } catch (e) {
            handleErrorInReadingCSS(e);
            return {};
        }

        return selectorsOb;
    };

    var existingCSSSelectorsWithAutocompleteObjects = {};
    var updateExistingCSSSelectorsAndAutocomplete = function (tagsToExclude) {
        window.existingCSSSelectors = getExistingCSSSelectors(tagsToExclude);

        existingCSSSelectorsWithAutocompleteObjects = $.extend(true, {}, window.existingCSSSelectors);
        Object.keys(existingCSSSelectorsWithAutocompleteObjects).forEach(function (key) {
            var sources = '';
            existingCSSSelectorsWithAutocompleteObjects[key].forEach(function (source) {
                if (sources !== '') {
                    sources += ', ';
                }
                sources += ellipsis(
                    source
                        .replace(/[?&]reloadedAt=[\d-_:.]+/, '')
                        .substr(source.lastIndexOf('/') + 1),
                    50
                );
            });

            existingCSSSelectorsWithAutocompleteObjects[key] = {
                sources: sources,
                originalSelector: key,
                text: key
            };
        });
    };
    updateExistingCSSSelectorsAndAutocomplete();

    var isChrome = false,
        isEdge = false,
        isFirefox = false,
        isOpera = false;
    if (/Edge/.test(navigator.appVersion)) {            // Test for "Edge" before Chrome, because Microsoft Edge browser also adds "Chrome" in navigator.appVersion
        isEdge = true;
    } else if (/OPR\//.test(navigator.appVersion)) {    // Test for "Opera" before Chrome, because Opera browser also adds "Chrome" in navigator.appVersion
        isOpera = true;
    } else if (/Chrome/.test(navigator.appVersion)) {
        isChrome = true;
    } else if (/Firefox/.test(navigator.userAgent)) {   // For Mozilla Firefox browser, navigator.appVersion is not useful, so we need to fallback to navigator.userAgent
        isFirefox = true;
    }

    var extensionUrl = {
        chrome: 'https://chrome.google.com/webstore/detail/ifhikkcafabcgolfjegfcgloomalapol',
        edge: 'https://www.microsoft.com/store/p/live-editor-for-css-and-less-magic-css/9nzmvhmw5md1',
        firefox: 'https://addons.mozilla.org/firefox/addon/live-editor-for-css-less-sass/',
        opera: 'https://addons.opera.com/extensions/details/live-editor-for-css-and-less-magic-css/'
    };
    extensionUrl.forThisBrowser = (function () {
        if (isEdge)         { return extensionUrl.edge;    }
        else if (isFirefox) { return extensionUrl.firefox; }
        else if (isOpera)   { return extensionUrl.opera;   }
        else                { return extensionUrl.chrome;  }
    }());

    /*
    // https://blog.github.com/2018-02-18-deprecation-notice-removing-anonymous-gist-creation/

    var strCreatedVia = 'Created via Magic CSS extension';
    if (isChrome) {
        strCreatedVia += ' for Chrome - ' + extensionUrl.chrome;
    } else if (isEdge) {
        strCreatedVia += ' for Edge - ' + extensionUrl.edge;
    } else if (isFirefox) {
        strCreatedVia += ' for Firefox - ' + extensionUrl.firefox;
    } else if (isOpera) {
        strCreatedVia += ' for Opera - ' + extensionUrl.opera;
    }
    var createGist = function (text, languageMode, cb) {
        var files = {};
        files[
            (function () {
                if (languageMode === 'less') {
                    return 'styles.less';
                } else if (languageMode === 'sass') {
                    return 'styles.scss';   // File extension for Sass is .scss (http://sass-lang.com/guide)
                } else {
                    return 'styles.css';
                }
            }())
        ] = {
            "content": text + '\r\n\r\n/* ' + strCreatedVia + ' *' + '/\r\n'
        };
        $.ajax({
            url: 'https://api.github.com/gists',
            type: 'POST',
            timeout: 20000,
            contentType: 'application/json',
            data: JSON.stringify({
                "description": window.location.origin + ' - via Magic CSS extension' + (function () {
                    if (isChrome) {
                        return ' for Chrome - ' + extensionUrl.chrome;
                    } else if (isEdge) {
                        return ' for Edge - ' + extensionUrl.edge;
                    } else if (isFirefox) {
                        return ' for Firefox - ' + extensionUrl.firefox;
                    } else if (isOpera) {
                        return ' for Opera - ' + extensionUrl.opera;
                    }
                    return '';
                }()),
                "public": true,
                "files": files
            }),
            error: function () {
                utils.alertNote('An unexpected error has occured.<br />We could not reach GitHub Gist.', 10000);
            },
            success: function (json, textStatus) {
                if (textStatus === 'success') {
                    cb(json.html_url);
                } else {
                    utils.alertNote('An unexpected error has occured.<br />We could not access GitHub Gist.', 10000);
                }
            }
        });
    };
    var createGistAndEmail = (function () {
        var lastMailedValue = null,
            lastSuccessNote = '';
        return function (text, languageMode) {
            text = $.trim(text);
            if (text === '') {
                utils.alertNote('Please type some code to be shared', 5000);
            } else if (lastMailedValue === text) {
                utils.alertNote(lastSuccessNote, 20000);
            } else {
                var wishToContinue = window.confirm('The code you have entered would be uploaded to\n        https://gist.github.com/\nand a link would be generated for sharing.\n\nDo you wish to continue?');
                if (!wishToContinue) {
                    return;
                }
                createGist(text, languageMode, function (gistUrl) {
                    var anchor = '<a target="_blank" href="' + gistUrl + '">' + gistUrl + '</a>';
                    lastMailedValue = text;
                    lastSuccessNote = 'The GitHub Gist was successfully created: ' +
                        anchor +
                        '<br/>Share code: <a href="' + 'mailto:?subject=Use this code for styling - ' + gistUrl + '&body=' +
                        encodeURIComponent(text.replace(/\t/g,'  ').substr(0,140) + '\r\n...\r\n...\r\n\r\n' + gistUrl + '\r\n\r\n-- ' + strCreatedVia + '') +
                        '">Send e-mail</a>';
                    utils.alertNote(lastSuccessNote, 10000);
                });
                utils.alertNote('Request initiated. It might take a few moments. Please wait.', 5000);
            }
        };
    }());
    /* */

    var htmlEscape = function (str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    var showCSSSelectorMatches = function (cssSelector, editor) {
        var cssSelectorString = (cssSelector && cssSelector.originalSelector) || cssSelector;
        if (!cssSelectorString) {
            utils.alertNote.hide();
        }

        if (!editor.styleHighlightingSelector) {
            editor.styleHighlightingSelector = new utils.StyleTag({
                id: 'magicss-highlight-by-selector',
                parentTag: 'body',
                attributes: [{
                    name: 'data-style-created-by',
                    value: 'magicss'
                }],
                overwriteExistingStyleTagWithSameId: true
            });
        }

        if (cssSelectorString) {
            // Helps in highlighting SVG elements
            editor.styleHighlightingSelector.cssText = cssSelectorString + '{outline: 1px dashed red !important; fill: red !important; }';
        } else {
            editor.styleHighlightingSelector.cssText = '';
        }
        editor.styleHighlightingSelector.applyTag();

        if (cssSelectorString) {
            var count;

            try {
                count = $(cssSelectorString).not('#MagiCSS-bookmarklet, #MagiCSS-bookmarklet *, #topCenterAlertNote, #topCenterAlertNote *').length;
            } catch (e) {
                return '';
            }

            var trunc = function (str, limit) {
                if (str.length > limit) {
                    var separator = ' ... ';
                    str = str.substr(0, limit / 2) + separator + str.substr(separator.length + str.length - limit / 2);
                }
                return str;
            };

            var cssSelectorToShow = htmlEscape(trunc(cssSelectorString, 100));
            var sourcesToShow = (cssSelector && cssSelector.sources) ? ('<br /><span style="color:#888">Source: <span style="font-weight:normal;">' + htmlEscape(decodeURIComponent(cssSelector.sources)) + '</span></span>') : '';
            if (count) {
                utils.alertNote(cssSelectorToShow + '&nbsp; &nbsp;<span style="font-weight:normal">(' + count + ' match' + ((count === 1) ? '':'es') + ')</span>' + sourcesToShow, 2500);
            } else {
                utils.alertNote(cssSelectorToShow + '&nbsp; &nbsp;<span style="font-weight:normal;">(No matches)</span>' + sourcesToShow, 2500);
            }
        }
    };

    var setCodeMirrorCSSLinting = async function (editor, enableOrDisable) {
        var cm = editor.cm,
            lint,
            gutters = [].concat(cm.getOption('gutters') || []);
        if (enableOrDisable === 'enable') {
            lint = true;
            gutters.unshift('CodeMirror-lint-markers');     // Using ".unshift()" rather than ".push()" to ensure that the "gutter" for "line-number" always comes after gutter for "linting"
            await editor.userPreference('use-css-linting', 'yes');
        } else {
            lint = false;
            var index = gutters.indexOf('CodeMirror-lint-markers');
            if (index > -1) {
                gutters.splice(index, 1);
            }
            await editor.userPreference('use-css-linting', 'no');
        }
        cm.setOption('gutters', gutters);
        cm.setOption('lint', lint);
    };

    var markAsPinnedOrNotPinned = async function (editor, pinnedOrNotPinned) {
        if (pinnedOrNotPinned === 'pinned') {
            editor.applyStylesAutomatically(true);
            await editor.userPreference('apply-styles-automatically', 'yes');
        } else {
            editor.applyStylesAutomatically(false);
            await editor.userPreference('apply-styles-automatically', 'no');
        }
    };

    var elementHadClassAttributeBeforePointAndSelect;
    // elementHadTitleAttributeBeforePointAndSelect,
    // titleValueOfElementBeforePointAndSelect;

    var removeMouseOverDomElementEffect = function (cb) {
        var $el = $('.magicss-mouse-over-dom-element');
        if ($el.length) {
            // if (!elementHadTitleAttributeBeforePointAndSelect) {
            //     var title = $el.attr('title');
            //     // If the title attribute is set by Magic CSS, it would start like:
            //     //     "Suggested CSS selector:" OR "Suggested CSS selectors:"
            //     if (title && title.indexOf('Suggested CSS selector') === 0) {
            //         $el.removeAttr('title');
            //     }
            // } else {
            //     if (titleValueOfElementBeforePointAndSelect) {
            //         $el.attr('title', titleValueOfElementBeforePointAndSelect);
            //     } else {
            //         $el.attr('title', '');
            //     }
            // }

            $el.removeClass('magicss-mouse-over-dom-element');
            if (!elementHadClassAttributeBeforePointAndSelect && !$el.attr('class')) {
                $el.removeAttr('class');
            }
        }
        if (cb) {
            cb();
        }
    };

    // Set testingDataIntegrityOfPointAndClickFunctionality as true for testing data integrity of point and click functionality
    var testingDataIntegrityOfPointAndClickFunctionality = false,
        forTestingOnly_InitialInnerHtml = '',
        forTestingOnly_FinalInnerHtml = '',
        forTestingOnly_getInnerHtml = function () {
            // Change the selctor depending on the webpage being tested
            return $('div').html();     // Return the innerHTML of the first available <div> element
        };

    var enablePointAndClick = false;
    var enablePointAndClickFunctionality = function (editor) {
        enablePointAndClick = true;
        if (testingDataIntegrityOfPointAndClickFunctionality) {
            forTestingOnly_InitialInnerHtml = forTestingOnly_getInnerHtml();
        }
        $(editor.container).addClass('magicss-point-and-click-activated');
    };
    var disablePointAndClickFunctionality = function (editor) {
        enablePointAndClick = false;
        $(editor.container).removeClass('magicss-point-and-click-activated');

        // This is useful when the user disables point-and-click using keyboard shortcut
        removeMouseOverDomElementEffect();
        if (testingDataIntegrityOfPointAndClickFunctionality) {
            forTestingOnly_FinalInnerHtml = forTestingOnly_getInnerHtml();
            if (forTestingOnly_FinalInnerHtml !== forTestingOnly_InitialInnerHtml) {
                console.log('Note: The data integrity of point and click functionality may have some minor issues.');
                console.log(forTestingOnly_InitialInnerHtml);
                console.log(forTestingOnly_FinalInnerHtml);
            } else {
                console.log('Note: The data integrity of point and click functionality is working fine.');
            }
        }
    };

    var enableAutocompleteSelectors = function (editor) {
        $(editor.container).removeClass('magicss-autocomplete-selectors-disabled').addClass('magicss-autocomplete-selectors-enabled');
    };

    var disableAutocompleteSelectors = function (editor) {
        $(editor.container).removeClass('magicss-autocomplete-selectors-enabled').addClass('magicss-autocomplete-selectors-disabled');
    };

    var highlightErroneousLineTemporarily = function (editor, errorInLine) {
        var lineHandle = editor.cm.addLineClass(errorInLine, 'background', 'line-has-parsing-error-transition-effect');
        editor.cm.addLineClass(errorInLine, 'background', 'line-has-parsing-error');
        var duration = 2000;
        setTimeout(async function () {
            editor.cm.removeLineClass(lineHandle, 'background', 'line-has-parsing-error');
            await asyncTimeout(500); /* 500ms delay matches the transition duration specified for the CSS selector ".line-has-parsing-error-transition-effect" */
            editor.cm.removeLineClass(lineHandle, 'background', 'line-has-parsing-error-transition-effect');
        }, duration);
    };

    // A pretty basic OS detection logic based on:
    // https://stackoverflow.com/questions/38241480/detect-macos-ios-windows-android-and-linux-os-with-js/38241481#38241481
    var getOS = function () {
        var platform = window.navigator.platform,
            os = null;

        if (platform.indexOf('Mac') === 0) {
            os = 'Mac OS';
        } else if (platform.indexOf('Win') === 0) {
            os = 'Windows';
        } else if (platform.indexOf('Linux') === 0) {
            os = 'Linux';
        }

        return os;
    };

    var getServerDetailsFromUserAlreadyOpen = false;
    var _getServerDetailsFromUser = async function (editor, cbGotServerDetailsFromUser) {
        if (getServerDetailsFromUserAlreadyOpen) {
            return;
        }
        getServerDetailsFromUserAlreadyOpen = true;

        /* eslint-disable indent */
        window.$backEndConnectivityOptions = $(
        // var $backEndConnectivityOptions = $(
            [
                '<div>',
                    '<div class="magic-css-full-page-overlay">',
                    '</div>',
                    '<div class="magic-css-full-page-contents magic-css-ui" style="pointer-events:none;">',
                        '<div style="display:flex;justify-content:center;align-items:center;height:100%;">',
                            '<div class="magic-css-back-end-connectivity-options" style="pointer-events:initial;">',
                                '<div class="magic-css-server-config-item" style="padding-bottom:0;">',
                                    '<div style="overflow-y:auto; max-height:calc(70vh - 70px);">',
                                        '<div style="margin-bottom:20px;">',
                                            'This feature is meant for use during web development.',
                                            ' You need to run a development server, called',
                                            ' <a target="_blank" href="https://www.npmjs.com/package/@webextensions/live-css" style="font-weight:bold; text-decoration:underline; color:#000;">live-css</a>',
                                            ', for using the features',
                                            ' "Edit file"',
                                            ' and "Watch CSS files to apply changes automatically".',
                                        '</div>',
                                        '<div>',
                                            '<div style="font-weight:bold; float:left;">Step 1:</div>',
                                            '<div style="margin-left:50px;">',
                                                'Install Node JS',
                                                ' <a target="_blank" href="https://nodejs.org/en/download/" style="margin-left:10px;">Download</a>',
                                                (function () {
                                                    var os = getOS(),
                                                        link;
                                                    if (os === 'Linux') {
                                                        link = 'https://www.ostechnix.com/install-node-js-linux/';
                                                    } else if (os === 'Windows') {
                                                        link = 'https://www.wikihow.com/Install-Node.Js-on-Windows';
                                                    } else if (os === 'Mac OS') {
                                                        link = 'https://nodesource.com/blog/installing-nodejs-tutorial-mac-os-x/';
                                                    }
                                                    if (link) {
                                                        return ' <a target="_blank" href="' + link + '" style="margin-left:10px;">Help</a>';
                                                    } else {
                                                        return '';
                                                    }
                                                }()),
                                            '</div>',
                                        '</div>',
                                        '<div style="padding-top:4px;">',
                                            '<div style="font-weight:bold; float:left;">Step 2:</div>',
                                            '<div style="margin-left:50px;">',
                                                'Install live-css server',
                                                ' <a target="_blank" href="https://www.npmjs.com/package/@webextensions/live-css" style="margin-left:10px;">Link</a>',
                                                ' <a target="_blank" href="https://docs.npmjs.com/cli/npm" style="margin-left:10px;">Help</a>',
                                                ' <a target="_blank" href="https://docs.npmjs.com/getting-started/fixing-npm-permissions" style="margin-left:10px;">Extra</a>',
                                                '<br />',
                                                '<div style="float:left; line-height:16px; background-color:#bbb; padding:3px 7px; border-radius:3px; margin-top:2px; font-family:monospace;">',
                                                    // Source for SVG: https://www.npmjs.com/package/@webextensions/live-css
                                                    '<svg viewBox="0 0 12.32 9.33" style="width:12px; height:16px; display:block; float:left;"><g><line class="st1" x1="7.6" y1="8.9" x2="7.6" y2="6.9"></line><rect width="1.9" height="1.9"></rect><rect x="1.9" y="1.9" width="1.9" height="1.9"></rect><rect x="3.7" y="3.7" width="1.9" height="1.9"></rect><rect x="1.9" y="5.6" width="1.9" height="1.9"></rect><rect y="7.5" width="1.9" height="1.9"></rect></g></svg>',
                                                    '<span>npm install -g @webextensions/<span class="live-css-highlight-if-server-client-incompatible">live-css@', constants.appMajorVersion, '</span></span>',
                                                '</div>',
                                            '</div>',
                                        '</div>',
                                        '<div style="clear:both; padding-top:4px;">',
                                            '<div style="font-weight:bold; float:left;">Step 3:</div>',
                                            '<div style="margin-left:50px;">',
                                                'Start live-css server in your project folder',
                                                '<br />',
                                                '<div style="float:left; line-height:16px; background-color:#bbb; padding:3px 7px; border-radius:3px; margin-top:2px; font-family:monospace;">',
                                                    // Source for SVG: https://www.npmjs.com/package/@webextensions/live-css
                                                    '<svg viewBox="0 0 12.32 9.33" style="width:12px; height:16px; display:block; float:left;"><g><line class="st1" x1="7.6" y1="8.9" x2="7.6" y2="6.9"></line><rect width="1.9" height="1.9"></rect><rect x="1.9" y="1.9" width="1.9" height="1.9"></rect><rect x="3.7" y="3.7" width="1.9" height="1.9"></rect><rect x="1.9" y="5.6" width="1.9" height="1.9"></rect><rect y="7.5" width="1.9" height="1.9"></rect></g></svg>',
                                                    'live-css',
                                                '</div>',
                                            '</div>',
                                        '</div>',
                                        '<div style="clear:both; padding-top:4px;">',
                                            '<div style="font-weight:bold; float:left;">Step 4:</div>',
                                            '<div style="margin-left:50px;">Enter following details based on previous command\'s output</div>',
                                        '</div>',
                                    '</div>',
                                    '<div class="magic-css-server-config-field-header" style="margin-top:20px;">',
                                        '<span style="color:#000; font-weight:bold;">Server path:</span> ',
                                        '<span style="color:#888;font-size:12px;">',
                                            '(eg: ',
                                            (function () {
                                                var protocol = constants.liveCssServer.defaultProtocol,
                                                    hostname = constants.liveCssServer.defaultHostname,
                                                    port = constants.liveCssServer.defaultPort;
                                                return protocol + '//' + hostname + ':' + port;
                                            }()),
                                            ')',
                                        '</span>',
                                    '</div>',
                                    '<div>',
                                        '<div style="width:50px; height:20px; float:left;">',
                                            '<div class="magic-css-server-connectivity-status" style="float:right; margin-right:10px; display:block; margin-top:2px; width:16px; height:16px; background-repeat:no-repeat;"></div>',
                                        '</div>',
                                        '<div style="margin-left:50px;">',
                                            '<span style="display:inline-block; line-height:21px;">' + constants.liveCssServer.defaultProtocol + '//&nbsp;</span>',
                                            '<input type="text" spellcheck="false" class="magic-css-server-hostname" placeholder="',
                                                constants.liveCssServer.defaultHostname,
                                                '" style="width:165px;"',
                                            ' />',
                                            '<span style="display:inline-block; line-height:21px;">&nbsp;:&nbsp;</span>',
                                            '<input type="number" min="1" max="65535" step="1" spellcheck="false" class="magic-css-server-port" placeholder="3456" style="width:80px;" />',
                                        '</div>',
                                    '</div>',
                                    '<div style="min-height:35px; padding-top:3px; clear:both;">',
                                        '<div class="live-css-connectivity-error-message live-css-server-client-general-error-message" style="display:none;">',
                                            '<div>You are not connected. Is live-css server running?</div>',
                                            // '<div>',
                                            //     'Do you need to enable CORS? ',
                                            //     '<a target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS" style="margin-left:10px;">Learn more</a>',
                                            // '</div>',
                                        '</div>',
                                        '<div class="live-css-connectivity-error-message live-css-server-client-incompatible-error-message" style="display:none;">',
                                            'Error: You need to use version ', constants.appMajorVersion, ' of the live-css server',
                                        '</div>',
                                    '</div>',
                                '</div>',
                                '<div class="magic-css-server-config-item">',
                                    '<div style="text-align:right">',
                                        '<button type="button" class="magicss-done-server-path-changes">Done</button>',
                                    '</div>',
                                '</div>',
                            '</div>',
                        '</div>',
                    '</div>',
                '</div>'
            ].join('')
        );
        /* eslint-enable indent */

        var $serverHostname = window.$backEndConnectivityOptions.find('.magic-css-server-hostname'),
            serverHostnameValue = await editor.userPreference('live-css-server-hostname') || constants.liveCssServer.defaultHostname;

        var $serverPort = window.$backEndConnectivityOptions.find('.magic-css-server-port'),
            serverPortValue = await editor.userPreference('live-css-server-port') || constants.liveCssServer.defaultPort;

        $serverHostname.val(serverHostnameValue);
        $serverHostname.on('input', async function () {
            serverHostnameValue = $(this).val().trim().replace(/\/$/, '') || constants.liveCssServer.defaultHostname;
            await editor.userPreference('live-css-server-hostname', serverHostnameValue);
            await socketOb.reset();
        });

        $serverPort.val(serverPortValue);
        $serverPort.on('input', async function () {
            serverPortValue = $(this).val().trim().replace(/\/$/, '') || constants.liveCssServer.defaultPort;
            await editor.userPreference('live-css-server-port', serverPortValue);
            await socketOb.reset();
        });

        // Useful when developing/debugging
        // $backEndConnectivityOptions.find('.magic-css-back-end-connectivity-options').draggable();   // Note: jQuery UI .draggable() adds "position: relative" inline. Overriding that in CSS with "position: fixed !important;"

        window.$backEndConnectivityOptions.find('.magicss-done-server-path-changes').on('click', async function () {
            await editor.userPreference('live-css-server-hostname', serverHostnameValue);
            await editor.userPreference('live-css-server-port', serverPortValue);

            window.$backEndConnectivityOptions.remove();
            getServerDetailsFromUserAlreadyOpen = false;

            if (cbGotServerDetailsFromUser) {
                cbGotServerDetailsFromUser(null, {
                    serverHostname: serverHostnameValue,
                    serverPort: serverPortValue
                });
            }
        });
        window.$backEndConnectivityOptions.find('.magicss-save-server-path-changes').on('click', async function () {
            await editor.userPreference('live-css-server-hostname', serverHostnameValue);
            await editor.userPreference('live-css-server-port', serverPortValue);

            await socketOb.reset();
        });
        $('body').append(window.$backEndConnectivityOptions);

        if (serverHostnameValue && serverPortValue) {
            await socketOb.reset();
        }
    };

    var updateUiMentioningNotWatchingCssFiles = async function (editor) {
        if (socketOb.flagWatchingCssFiles) {
            socketOb.flagWatchingCssFiles = false;
            utils.alertNote('Stopped watching CSS files for changes');
            $(editor.container).removeClass('watching-css-files');
            editor.adjustUiPosition();
        }
        await editor.userPreference('watching-css-files', 'no');
    };

    var liveCssServerSessionClosedByUser = async function (editor) {
        // TODO:
        //     When file editing feature is available,
        //     disable editing file / notify user when
        //     the server session is disconnected

        await updateUiMentioningNotWatchingCssFiles(editor);
    };

    var $toastrConnecting,
        $toastrConnected,
        $toastrReconnectAttempt;
    var _getConnectedWithBackEnd = async function (editor, mainAsyncCallback) {
        var serverHostnameValue = await editor.userPreference('live-css-server-hostname') || constants.liveCssServer.defaultHostname,
            serverPortValue = await editor.userPreference('live-css-server-port') || constants.liveCssServer.defaultPort;

        if (socketOb.socket) {
            var socketOpts = (socketOb.socket.io || {}).opts || {};
            if (
                socketOpts.hostname === serverHostnameValue &&
                socketOpts.port === serverPortValue &&
                socketOb.socket.connected
            ) {
                await mainAsyncCallback();
                return;
            } else {
                editor.markLiveCssServerConnectionStatus(false);
                socketOb.close();
            }
        }

        var backEndPathToShowToUser = serverHostnameValue + ':' + serverPortValue;
        if ($toastrConnecting) {
            $toastrConnecting.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
        }
        if ($toastrConnected) {
            $toastrConnected.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
        }
        if ($toastrReconnectAttempt) {
            $toastrReconnectAttempt.hide();   // Using jQuery's .hide() directly, rather than toastr.clear(), because there is no option to pass duration in the function call itself
        }

        $toastrConnecting = toastr.info(
            '<div style="display:block; text-align:center; margin-top:3px; margin-bottom:15px; font-weight:bold;">' +
                backEndPathToShowToUser +
            '</div>' +
            '<div>' +
                '<button type="button" class="magic-css-toastr-socket-cancel" style="float:right;">Cancel</button>' +
                '<button type="button" class="magic-css-toastr-socket-configure">Settings</button>' +
            '</div>',
            'Connecting with live-css server at: ',
            {
                timeOut: 0,
                onclick: async function (evt) {
                    if ($(evt.target).hasClass('magic-css-toastr-socket-configure')) {
                        // TODO: Verify functionality
                        await _getServerDetailsFromUser(editor);
                    } else if ($(evt.target).hasClass('magic-css-toastr-socket-cancel')) {
                        await getDisconnectedWithBackEnd(
                            editor,
                            {},
                            async function asyncCallback () {
                                await updateUiMentioningNotWatchingCssFiles(editor);
                            }
                        );
                    }
                }
            }
        );

        // If the user is loading it for the first time on this domain,
        // show them the configuration options along with the guide/help
        // about the live-css server
        if (
            !(await editor.userPreference('live-css-server-hostname')) ||
            !(await editor.userPreference('live-css-server-port'))
        ) {
            await _getServerDetailsFromUser(editor, function (err) {
                if (!err) {
                    setTimeout(async function () {
                        await socketOb.reset(async function () {
                            await mainAsyncCallback();
                        });
                    });
                }
            });
        } else {
            await socketOb.reset(async function () {
                await mainAsyncCallback();
            });
        }
    };

    var getDisconnectedWithBackEnd = async function (editor, options, asyncCallback) {
        socketOb.close();
        if ($toastrConnected) {
            toastr.clear($toastrConnected, {force: true});
        }
        if ($toastrConnecting) {
            toastr.clear($toastrConnecting, {force: true});
        }
        if ($toastrReconnectAttempt) {
            toastr.clear($toastrReconnectAttempt, {force: true});
        }
        await asyncCallback();
    };

    var isMac = false;
    try {
        isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    } catch (e) {
        // do nothing
    }

    var noteForUndo = '<br />Note: You may press ' + (isMac ? 'Cmd' : 'Ctrl') + ' + Z to undo the change';

    // Seems to be required to unblock Ctrl-T in Microsoft Edge
    delete CodeMirror.keyMap.emacsy['Ctrl-T'];
    delete CodeMirror.keyMap.sublime['Ctrl-T'];

    // Use Alt-Up/Down to move lines up/down
    CodeMirror.keyMap.sublime['Alt-Down'] = 'swapLineDown';
    CodeMirror.keyMap.sublime['Alt-Up'] = 'swapLineUp';

    var main = async function () {
        await utils.delayFunctionUntilTestFunction({
            tryLimit: 100,
            waitFor: 500,
            fnTest: function () {
                if ((window.Editor || {}).usable) {
                    return true;
                }
                return false;
            },
            fnFirstFailure: function () {
                // do nothing
            },
            fnFailure: function () {
                // do nothing
            },
            fnSuccess: async function () {
                var beautifyCSS = async function (cssCode) {
                    var options = {};
                    if (await window.MagiCSSEditor.userPreference('use-tab-for-indentation') === 'yes') {
                        options.useTabs = true;
                    } else {
                        options.useSpaceCount = parseInt(await window.MagiCSSEditor.userPreference('indentation-spaces-count'), 10) || 4;
                    }
                    return utils.beautifyCSS(cssCode, options);
                };

                var getMatchingAndSuggestedSelectors = function (targetElement) {
                    var selector = window.generateFullSelector(targetElement);
                    var workingSetOfSelectors = $.extend({}, window.existingCSSSelectors);

                    var matchAll = function (fullSelector, smallSelector) {
                        var tokens = smallSelector.split('.').join(' ').split('#').join(' ').split(' ');
                        var tokenNotAvailable = tokens.some(function tokenNotInFullSelector(token) {
                            return fullSelector.indexOf(token) === -1;
                        });
                        if (tokenNotAvailable === false) {
                            return true;
                        }
                    };

                    var matchingSelectors = [];

                    var suggestedSelectors = [];
                    try {
                        suggestedSelectors = [
                            window.generateSelector(targetElement, {skipClass: 'magicss-mouse-over-dom-element'}),
                            window.generateSelector(targetElement, {skipClass: 'magicss-mouse-over-dom-element', reverseClasses: true}),
                            window.generateSelector(targetElement, {skipClass: 'magicss-mouse-over-dom-element', sortClasses: true}),
                            window.generateSelector(targetElement, {skipClass: 'magicss-mouse-over-dom-element', sortClasses: true, reverseClasses: true})
                        ];
                    } catch (e) {
                        var errorMessageHTML = 'Sorry! Magic CSS encountered an error in generating CSS selector!<br />Kindly report this issue at <a target="_blank" href="https://github.com/webextensions/live-css-editor/issues">GitHub repository for Magic CSS</a>';
                        var errorMessageConsole = 'Sorry! Magic CSS encountered an error in generating CSS selector!\nKindly report this issue at https://github.com/webextensions/live-css-editor/issues (GitHub repository for Magic CSS)';
                        // Kind of HACK: Show note after a timeout, otherwise the note about matching existing selector might open up and override this
                        //               and trying to solve it without timeout would be a bit tricky because currently, in CodeMirror, the select event
                        //               always gets fired
                        setTimeout(function() { utils.alertNote(errorMessageHTML, 10000); }, 0);
                        console.log(errorMessageConsole);
                        console.log(e);     // The user might wish to add these detais for the report/issue in GitHub about this error.
                    }
                    suggestedSelectors = suggestedSelectors.filter(function(item, pos, self) {
                        return self.indexOf(item) == pos;
                    });

                    matchingSelectors = matchingSelectors.concat(suggestedSelectors);

                    Object.keys(workingSetOfSelectors).forEach(function (key) {
                        var existingSelector = key;
                        var matchesAll = matchAll(selector, existingSelector);
                        if (matchesAll) {
                            if ($(targetElement).is(existingSelector)) {
                                if (matchingSelectors.indexOf(existingSelector) === -1) {
                                    matchingSelectors.push(existingSelector);
                                }
                            }
                        }
                    });

                    return {
                        matchingAndSuggestedSelectors: matchingSelectors,   // TODO: Fix variable naming
                        suggestedSelectors: suggestedSelectors
                    };
                };

                var currentNode = null;
                var timerActiveSelectorCalculation = null;
                $(document).on('mousemove', function(event) {
                    if (!enablePointAndClick) {
                        return;
                    }

                    if ($(event.target) !== currentNode) {
                        currentNode = $(event.target);

                        if ($(currentNode).hasClass('magicss-mouse-over-dom-element')) {
                            // do nothing
                        } else {
                            removeMouseOverDomElementEffect();
                            utils.alertNote.hide();     // Hide the suggestions shown previously (for other elements)
                            if (currentNode.get(0) !== $('#MagiCSS-bookmarklet').get(0) && !$(currentNode).parents('#MagiCSS-bookmarklet').length) {
                                window.clearTimeout(timerActiveSelectorCalculation);
                                timerActiveSelectorCalculation = window.setTimeout(function () {
                                    if (currentNode.get(0) !== event.target) {
                                        return;
                                    }
                                    var matchingAndSuggestedSelectors = getMatchingAndSuggestedSelectors(currentNode.get(0)).matchingAndSuggestedSelectors;

                                    elementHadClassAttributeBeforePointAndSelect = currentNode.get(0).hasAttribute('class');

                                    // elementHadTitleAttributeBeforePointAndSelect = currentNode.get(0).hasAttribute('title');
                                    // if (elementHadTitleAttributeBeforePointAndSelect) {
                                    //     titleValueOfElementBeforePointAndSelect = currentNode.attr('title');
                                    // } else {
                                    //     titleValueOfElementBeforePointAndSelect = undefined;
                                    // }

                                    var title = '';
                                    if (matchingAndSuggestedSelectors.length === 1) {
                                        title = 'Suggested CSS selector:';
                                    } else if (matchingAndSuggestedSelectors.length > 1) {
                                        title = 'Suggested CSS selectors:';
                                    }
                                    // title += '\n    ' + matchingAndSuggestedSelectors.join('\n    ');
                                    // $(currentNode).attr('title', title);
                                    title += '<span style="font-weight:normal;">' + '<br />' + matchingAndSuggestedSelectors.join('<br />') + '</span>';

                                    utils.alertNote(
                                        title,
                                        5000,
                                        {
                                            textAlignment: 'left',
                                            unobtrusive: true
                                        }
                                    );
                                }, 500);
                                $(currentNode).addClass('magicss-mouse-over-dom-element');
                            }
                        }
                    }
                });

                $(document).on('mousedown', function(evt) {
                    if (evt.which !== 1) {      // If it is not left click
                        return;
                    }
                    if (!enablePointAndClick) {
                        return;
                    } else {
                        if ($(evt.target).hasClass('magicss-point-and-click')) {
                            // do nothing
                        } else {
                            disablePointAndClickFunctionality(window.MagiCSSEditor);
                        }
                    }

                    var currentNode = $(evt.target);
                    if (currentNode.get(0) === $('#MagiCSS-bookmarklet').get(0) || $(currentNode).parents('#MagiCSS-bookmarklet').length) {
                        return;
                    }

                    var $div = $('<div></div>');
                    $('body').append($div);
                    $div.attr('class', 'magicss-block-click');
                    $div.css('position', 'fixed');
                    $div.css('background-color', 'rgba(0,0,0,0)');
                    $div.css('z-index', '2147483600');
                    $div.css('width', '100%');
                    $div.css('height', '100%');
                    $div.css('left', '0px');
                    $div.css('top', '0px');

                    removeMouseOverDomElementEffect();
                    $div.on('mouseup', function () {
                        $div.remove();
                    });

                    var targetElement = evt.target;
                    setTimeout(async function () {
                        var selectorsOb = getMatchingAndSuggestedSelectors(targetElement);
                        // TODO: Fix variable naming
                        var matchingSelectors = selectorsOb.matchingAndSuggestedSelectors,
                            suggestedSelectors = selectorsOb.suggestedSelectors;

                        var cm = window.MagiCSSEditor.cm;

                        var currentLine = cm.getLine(cm.getCursor().line);
                        var whitespaceCharactersInCurrentLine = ((currentLine.match(/^\s+/g)) || [''])[0];

                        var originalCursorPosition = cm.getCursor();
                        var anyCharacterAfterCurrentCursorPosition = true;
                        var anyNonWhitespaceCharacterBeforeCurrentCursorPosition = true;

                        var indexOfFirstNonWhitespaceCharacter = currentLine.length - currentLine.trimLeft().length;
                        if (indexOfFirstNonWhitespaceCharacter >= originalCursorPosition.ch) {
                            anyNonWhitespaceCharacterBeforeCurrentCursorPosition = false;
                        }
                        if (originalCursorPosition.ch === currentLine.length) {
                            anyCharacterAfterCurrentCursorPosition = false;
                        }

                        var useTabs = (await window.MagiCSSEditor.userPreference('use-tab-for-indentation')) === 'yes';
                        var whitespaceToAdd;
                        if (useTabs) {
                            whitespaceToAdd = '\t';
                        } else {
                            var indentationSpacesCount = parseInt(await window.MagiCSSEditor.userPreference('indentation-spaces-count'), 10);
                            whitespaceToAdd = ' '.repeat(indentationSpacesCount || 4);
                        }

                        var extraSpaces = whitespaceCharactersInCurrentLine;
                        for (let i = 0; i < matchingSelectors.length; i++) {
                            matchingSelectors[i] = {
                                displayText: matchingSelectors[i],
                                originalSelector: matchingSelectors[i],
                                sources: (function () {
                                    var sources = [];
                                    if (suggestedSelectors.indexOf(matchingSelectors[i]) >= 0) {
                                        sources.push('Suggested by Magic CSS');
                                    }

                                    if (window.existingCSSSelectors[matchingSelectors[i]]) {
                                        sources = sources.concat(
                                            window.existingCSSSelectors[matchingSelectors[i]].map(function (item) {
                                                // Remove the "reloadedAt=..." part from the URL
                                                return item.replace(/[?&]reloadedAt=[\d-_:.]+/, '');
                                            })
                                        );
                                    }

                                    return sources;
                                }()),
                                text: (anyNonWhitespaceCharacterBeforeCurrentCursorPosition ? ('\n' + extraSpaces) : '') +
                                    matchingSelectors[i] + ' {' +
                                    '\n' + extraSpaces + whitespaceToAdd +
                                    '\n' + extraSpaces + '}' +
                                    (anyCharacterAfterCurrentCursorPosition ? ('\n' + extraSpaces) : '')
                            };
                        }

                        for (let i = 0; i < matchingSelectors.length; i++) {
                            var sources = '';
                            matchingSelectors[i].sources.forEach(function (source) {
                                if (sources !== '') {
                                    sources += ', ';
                                }
                                sources += ellipsis(source.substr(source.lastIndexOf('/') + 1), 50);
                            });

                            matchingSelectors[i].sources = sources;
                        }

                        if (cm.showHint) {
                            cm.focus();

                            var ob = {
                                from: cm.getDoc().getCursor(),
                                to: cm.getDoc().getCursor(),
                                list: matchingSelectors
                            };

                            CodeMirror.on(ob, 'select', function (selectedTextOb) {
                                showCSSSelectorMatches(selectedTextOb, window.MagiCSSEditor);
                            });

                            CodeMirror.on(ob, 'pick', function () {
                                var cursorPos = cm.getCursor();
                                if (anyCharacterAfterCurrentCursorPosition) {
                                    cm.setCursor({ line: cursorPos.line - 2 });
                                } else {
                                    cm.setCursor({ line: cursorPos.line - 1 });
                                }
                            });

                            CodeMirror.on(ob, 'close', function () {
                                window.MagiCSSEditor.styleHighlightingSelector.cssText = '';
                                window.MagiCSSEditor.styleHighlightingSelector.applyTag();
                            });

                            cm.showHint({
                                hint: function() {
                                    return ob;
                                }
                            });
                        }
                    });
                    return false;
                });

                var csSpec = CodeMirror.resolveMode('text/css'),
                    cssPropertyKeywords = csSpec.propertyKeywords,
                    cssPropertyKeywordsAutocompleteObject = {};
                Object.keys(cssPropertyKeywords).forEach(function (key) {
                    cssPropertyKeywordsAutocompleteObject[key] = {
                        displayText: key,
                        text: key + ': '
                    };
                });

                // Don't let mouse scroll on CodeMirror hints pass on to the parent elements
                // http://stackoverflow.com/questions/5802467/prevent-scrolling-of-parent-element/16324762#16324762
                $(document).on('DOMMouseScroll mousewheel', '.CodeMirror-hints', function(ev) {
                    var $this = $(this),
                        scrollTop = this.scrollTop,
                        scrollHeight = this.scrollHeight,
                        height = $this.innerHeight(),
                        delta = (ev.type == 'DOMMouseScroll' ?
                            ev.originalEvent.detail * -40 :
                            ev.originalEvent.wheelDelta),
                        up = delta > 0;

                    var prevent = function() {
                        ev.stopPropagation();
                        ev.preventDefault();
                        ev.returnValue = false;
                        return false;
                    };

                    if (!up && -delta > scrollHeight - height - scrollTop) {
                        // Scrolling down, but this will take us past the bottom.
                        $this.scrollTop(scrollHeight);
                        return prevent();
                    } else if (up && delta > scrollTop) {
                        // Scrolling up, but this will take us past the top.
                        $this.scrollTop(0);
                        return prevent();
                    }
                });

                var smc;

                var id = 'MagiCSS-bookmarklet',
                    newStyleTagId = id + '-html-id',
                    newStyleTag = new utils.StyleTag({
                        id: newStyleTagId,
                        parentTag: 'body',
                        attributes: [{
                            name: 'data-style-created-by',
                            value: 'magicss'
                        }],
                        overwriteExistingStyleTagWithSameId: true
                    });

                var saveStatusUpdateTimeout;
                var fnApplyTextAsCSS = async function (editor, options) {
                    options = options || {};
                    var disabled = false;
                    if ((await editor.userPreference('disable-styles')) === 'yes') {
                        disabled = true;
                    }

                    if (getLanguageMode() === 'file') {
                        if (options.skipSavingFile) {
                            // do nothing
                        } else {
                            var targetFileContents = editor.getTextValue();

                            var $fileEditStatus = $('.footer-for-server-mode .file-edit-status');
                            var saveInProgress = true;
                            setTimeout(function () {
                                if (saveInProgress) {
                                    $fileEditStatus.html('<span style="top:-1px; position:relative;">◔</span> Saving');
                                }
                            }, 300);

                            var filePath = await editor.userPreference('file-to-edit');

                            socketOb.socket.emit(
                                'PUT',
                                {
                                    url: '/live-css/edit-file/' + filePath,
                                    targetFileContents: targetFileContents
                                },
                                function (status) {
                                    saveInProgress = false;

                                    if (status === 'success') {
                                        $fileEditStatus.html('✔ Saved');

                                        clearTimeout(saveStatusUpdateTimeout);
                                        saveStatusUpdateTimeout = setTimeout(function () {
                                            $fileEditStatus.html('');
                                        }, 2500);
                                    } else {
                                        $fileEditStatus.html('✘ Save failed');

                                        utils.alertNote(
                                            '<span style="font-weight:normal">Your recent changes are not saved. Please try again.</span>' +
                                            '<br/>Probable cause: <span style="font-weight:normal">live-css server encountered an unexpected error in saving the file</span>',
                                            7500,
                                            {
                                                backgroundColor: '#f5bcae',
                                                borderColor: '#e87457'
                                            }
                                        );
                                    }
                                }
                            );
                        }
                    } else if (getLanguageMode() === 'less') {
                        var lessCode = editor.getTextValue(),
                            lessOptions = { sourceMap: true };

                        less.render(lessCode, lessOptions, async function asyncCallback(err, output) {
                            smc = null;     // Unset old SourceMapConsumer

                            if (err) {
                                // FIXME: The following setTimeout is a temporary fix for alertNote getting hidden by 'delayedcursormove()'
                                setTimeout(function () {
                                    utils.alertNote(
                                        'Invalid LESS syntax.' +
                                        '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                        '<br />Error message: ' + err.message,
                                        10000
                                    );
                                    highlightErroneousLineTemporarily(editor, err.line - 1);
                                }, 0);
                            } else {
                                var strCssCode = output.css;
                                newStyleTag.cssText = strCssCode;
                                newStyleTag.disabled = disabled;
                                let appliedCssText = newStyleTag.applyTag();
                                await rememberLastAppliedCss(appliedCssText);

                                var rawSourceMap = output.map;
                                if (rawSourceMap) {
                                    smc = new sourceMap.SourceMapConsumer(rawSourceMap);
                                }
                            }
                        });
                    } else if (getLanguageMode() === 'sass') {
                        var fnSassToCssAndApply = function () {
                            var Sass = window.Sass,
                                sassCode = editor.getTextValue() || ' ';    // Sass compiler throws an error for empty code string

                            Sass.compile(sassCode, async function asyncCallback(result) {
                                smc = null;     // Unset old SourceMapConsumer

                                if (result.status === 0) {
                                    var strCssCode = result.text || '';
                                    newStyleTag.cssText = strCssCode;
                                    newStyleTag.disabled = disabled;
                                    let appliedCssText = newStyleTag.applyTag();
                                    await rememberLastAppliedCss(appliedCssText);
                                    var rawSourceMap = result.map;
                                    if (rawSourceMap) {
                                        smc = new sourceMap.SourceMapConsumer(rawSourceMap);
                                    }
                                } else if (result.message) {
                                    var err = result;
                                    // FIXME: The following setTimeout is a temporary fix for alertNote getting hidden by 'delayedcursormove()'
                                    setTimeout(function () {
                                        utils.alertNote(
                                            'Invalid SASS syntax.' +
                                            '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                            '<br />Error message: ' + err.message,
                                            10000
                                        );
                                        highlightErroneousLineTemporarily(editor, err.line - 1);
                                    }, 0);
                                } else {
                                    // FIXME: The following setTimeout is a temporary fix for alertNote getting hidden by 'delayedcursormove()'
                                    setTimeout(function () {
                                        utils.alertNote(
                                            'Unexpected error in parsing Sass.' +
                                            '<br />Please report this bug at <a href="https://github.com/webextensions/live-css-editor/issues">https://github.com/webextensions/live-css-editor/issues</a>',
                                            10000
                                        );
                                    }, 0);
                                }
                            });
                        };
                        if (isOpera || window.Sass) {
                            fnSassToCssAndApply();
                        } else {
                            // Ensure that we don't send multiple load requests at once, by not sending request if previous one is still pending for succeess/failure
                            if (!window.isActiveLoadSassRequest) {
                                window.isActiveLoadSassRequest = true;
                                                // https://github.com/medialize/sass.js
                                                // https://cdnjs.com/libraries/sass.js
                                var sassJsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/sass.js/0.10.9/sass.sync.min.js',
                                    preRunReplace = [{oldText: 'this,function', newText: 'window,function'}];   // Required for making Sass load in Firefox - Reference: https://developer.mozilla.org/en-US/docs/Mozilla/Tech/Xray_vision
                                if (!options.skipNotifications) {
                                    utils.alertNote('Loading... Sass parser from:<br />' + sassJsUrl, 10000);
                                }

                                try {
                                    chrome.runtime.sendMessage(
                                        {
                                            loadRemoteJs: sassJsUrl,
                                            preRunReplace: preRunReplace
                                        },
                                        function (error) {
                                            window.isActiveLoadSassRequest = false;
                                            if (chrome.runtime.lastError) {
                                                console.log('Error message reported by Magic CSS:', chrome.runtime.lastError);
                                                utils.alertNote(
                                                    'Error! Unexpected error encountered by Magic CSS extension.<br />You may need to reload webpage & Magic CSS and try again.',
                                                    10000
                                                );
                                            } else if (error) {
                                                utils.alertNote(
                                                    'Error! Failed to load Sass parser from:<br />' + sassJsUrl + '<br />Please ensure that you are connected to internet and Magic CSS will try again to load it when you make any code changes.',
                                                    10000
                                                );
                                            } else {
                                                if (!options.skipNotifications) {
                                                    utils.alertNote('Loaded Sass parser from:<br />' + sassJsUrl, 2000);
                                                }
                                                setTimeout(function () {
                                                    // Ensure that getLanguageMode() is still 'sass'
                                                    if (getLanguageMode() === 'sass') {
                                                        fnSassToCssAndApply();
                                                    }
                                                }, 300);
                                            }
                                        }
                                    );
                                } catch (e) {
                                    window.isActiveLoadSassRequest = false;
                                    console.log('Error message reported by Magic CSS:', e);
                                    // Kind of HACK: Show note after a timeout, otherwise the note about matching existing selector might open up and override this
                                    //               and trying to solve it without timeout would be a bit tricky because currently, in CodeMirror, the select event
                                    //               always gets fired
                                    setTimeout(function() {
                                        utils.alertNote(
                                            'Error! Unexpected error encountered by Magic CSS extension.<br />You may need to reload webpage & Magic CSS and try again.',
                                            10000
                                        );
                                    }, 0);
                                }
                            }
                        }
                    } else {
                        var cssCode = editor.getTextValue();
                        newStyleTag.cssText = cssCode;
                        newStyleTag.disabled = disabled;
                        let appliedCssText = newStyleTag.applyTag();
                        await rememberLastAppliedCss(appliedCssText);
                    }
                };

                var showFileEditOptions = async function (editor, callback) {
                    /* eslint-disable indent */
                    var $fileEditOptions = $(
                        [
                            '<div>',
                                '<div class="magic-css-full-page-overlay">',
                                '</div>',
                                '<div class="magic-css-full-page-contents magic-css-ui" style="pointer-events:none;">',
                                    '<div style="display:flex;justify-content:center;/*align-items:center;*/margin-top:38px;height:100%;">',
                                        '<div class="magic-css-edit-file-options" style="pointer-events:initial;">',
                                            '<div class="magic-css-row magic-css-file-config-item">',
                                                '<div class="magic-css-row-item-1 magic-css-file-field-header">File to edit</div>',
                                                '<div class="magic-css-row-item-2"><input class="magicss-file-to-edit" /></div>',
                                            '</div>',
                                            '<div class="magic-css-row magic-css-file-config-item" style="text-align:center">',
                                                '<button type="button" class="magicss-start-file-editing" disabled="disabled">Start Editing</button>',
                                                '<button type="button" class="magicss-cancel-file-mode" style="margin-left:20px">Cancel</button>',
                                            '</div>',
                                        '</div>',
                                    '</div>',
                                '</div>',
                            '</div>'
                        ].join('')
                    );
                    /* eslint-enable indent */

                    var fileSuggestionValue = await editor.userPreference('file-to-edit');

                    var fileSuggestions = $fileEditOptions.find('.magicss-file-to-edit').magicSuggest({
                        method: 'GET',
                        placeholder: 'Type file name or click here',
                        // noSuggestionText: 'Could not find a matching file', // This option didn't seem to work
                        allowFreeEntries: false,
                        maxSelection: 1,
                        typeDelay: 50,
                        useZebraStyle: true,
                        // expanded: true, // We may want it, but it seems more cleaner without expanded: true
                        // expandOnFocus: true, // This option (when set to true) does not seem to work well with useTabKey: true
                        useTabKey: true,
                        toggleOnClick: true,
                        inputCfg: {
                            id: 'file-suggestion-input' // Useful for setting focus later on
                        },
                        value: (function () {
                            var ob = undefined;
                            if (fileSuggestionValue) {
                                ob = {
                                    id: fileSuggestionValue,
                                    name: fileSuggestionValue
                                };
                            }
                            return ob;
                        }()),

                        data: await (async function () {
                            var protocolValue = (window.location.protocol === 'https:') ? 'https:' : 'http:',
                                serverHostnameValue = await editor.userPreference('live-css-server-hostname') || constants.liveCssServer.defaultHostname,
                                serverPortValue = await editor.userPreference('live-css-server-port') || constants.liveCssServer.defaultPort,
                                backEndPath = serverHostnameValue + ':' + serverPortValue + '/',
                                url = protocolValue + '//' + backEndPath + 'live-css/list-of-editable-files';
                            return url;
                        }())

                        // data: [{"id":"Paris", "name":"Paris"}, {"id":"New York", "name":"New York"}]
                        // data: 'random.json',
                        // renderer: function(data){
                        //     return '<div style="padding: 5px; overflow:hidden;">' +
                        //     // '<div style="float: left;"><img src="' + data.picture + '" /></div>' +
                        //     '<div style="float: left; margin-left: 5px">' +
                        //     '<div style="font-weight: bold; color: #333; font-size: 10px; line-height: 11px">' + data.name + '</div>' +
                        //     '<div style="color: #999; font-size: 9px">' + data.name + '</div>' +
                        //     '</div>' +
                        //     '</div><div style="clear:both;"></div>'; // make sure we have closed our dom stuff
                        // }
                    });
                    window.fileSuggestions = fileSuggestions;

                    var $fileSuggestions = $(fileSuggestions);
                    $fileSuggestions.on('selectionchange', async function(e, m){   // eslint-disable-line no-unused-vars
                        var fileToEdit = this.getValue()[0] || '';
                        if (fileToEdit) {
                            $fileEditOptions.find('.magicss-start-file-editing').removeAttr('disabled');
                        } else {
                            $fileEditOptions.find('.magicss-start-file-editing').attr('disabled', 'disabled');
                        }
                    });

                    // If we wish to make it draggable, then ideally, the height/direction of the files list would also
                    // need to be adjusted. Hence, commenting it out for now.
                    // console.log('TODO - Comment it out');
                    // $fileEditOptions.find('.magic-css-edit-file-options').draggable();      // Note: jQuery UI .draggable() adds "position: relative" inline. Overriding that in CSS with "position: fixed !important;"

                    // $fileEditOptions.find('.magic-css-full-page-overlay, .magicss-cancel-file-mode').on('click', function () {
                    $fileEditOptions.find('.magicss-cancel-file-mode').on('click', function () {
                        $fileEditOptions.remove();
                    });
                    $fileEditOptions.find('.magicss-start-file-editing').on('click', async function () {
                        var filePath = fileSuggestions.getValue()[0] || '';
                        await editor.userPreference('file-to-edit', filePath);
                        $fileEditOptions.remove();
                        callback(filePath);
                    });
                    $('body').append($fileEditOptions);

                    await asyncTimeout(0); // Required for the focus functionality to work correctly
                    $fileEditOptions.find('#file-suggestion-input').focus();
                };

                var loadFile = function (options) {
                    var filePath = options.filePath,
                        successCallback = options.successCallback,
                        asyncErrorCallback = options.errorCallback;

                    // Using a timeout of 0ms so that the "socket" gets initiated if it is required
                    setTimeout(function () {
                        socketOb.socket.emit(
                            'GET',
                            {
                                url: filePath
                            },
                            async function (status, data) {
                                if (status === 'success') {
                                    successCallback({
                                        path: filePath,
                                        contents: data.fileContents
                                    });
                                } else {
                                    await asyncErrorCallback();
                                }
                            }
                        );
                    }, 0);
                };

                var getDataForFileToEdit = async function (editor, options, cbWhenGotDataForFileToEdit) {
                    options = options || {};
                    var needInputThroughUi = true;

                    var pathOfFileToEdit = await editor.userPreference('file-to-edit');
                    if (pathOfFileToEdit) {
                        needInputThroughUi = false;
                    }

                    socketOb.getConnected(editor, async function () {
                        if (needInputThroughUi || options.showUi) {
                            await showFileEditOptions(editor, function (filePath) {
                                loadFile({
                                    filePath: filePath,
                                    successCallback: function (file) {
                                        cbWhenGotDataForFileToEdit(file);
                                    },
                                    errorCallback: async function () {
                                        await editor.userPreference('file-to-edit', null);
                                        await getDataForFileToEdit(editor, options, cbWhenGotDataForFileToEdit);
                                    }
                                });
                            });
                        } else {
                            loadFile({
                                filePath: pathOfFileToEdit,
                                successCallback: function (file) {
                                    cbWhenGotDataForFileToEdit(file);
                                },
                                errorCallback: async function () {
                                    await editor.userPreference('file-to-edit', null);
                                    await getDataForFileToEdit(editor, options, cbWhenGotDataForFileToEdit);
                                }
                            });
                        }
                    });
                };

                var setLanguageModeClass = function (editor, cls) {
                    $(editor.container)
                        .removeClass('magicss-selected-mode-css')
                        .removeClass('magicss-selected-mode-less')
                        .removeClass('magicss-selected-mode-sass')
                        .removeClass('magicss-selected-mode-file')
                        .addClass(cls);
                    editor.adjustUiPosition();
                };

                var setLanguageMode = async function (newLanguageMode, editor, options) {
                    options = options || {};
                    if (newLanguageMode === 'file') {
                        var fileEditingOptions = {};
                        var previousLanguageMode = getLanguageMode();
                        // If previous mode was also 'file' (meaning the user clicked again), then we prompt the user for selecting file (or related options)
                        if (previousLanguageMode === 'file') {
                            fileEditingOptions.showUi = true;
                        }

                        if (previousLanguageMode === 'file') {
                            // do nothing
                        } else {
                            await editor.userPreference('language-mode-non-file', previousLanguageMode);
                        }
                        await getDataForFileToEdit(editor, fileEditingOptions, async function (file) {
                            editor.options.rememberText = false;

                            setLanguageModeClass(editor, 'magicss-selected-mode-file');
                            await editor.userPreference('language-mode', 'file');
                            editor.cm.setOption('mode', 'text/x-less');
                            setCodeMirrorCSSLinting(editor, 'disable');

                            socketOb.flagEditingFile = true;
                            // $('.footer-for-server-mode').show();
                            // editor.adjustUiPosition();

                            // TODO: Fix this code related to "getFileNameFromPath" (it is not in a consistent state after the rebase operation)
                            // TODO: Reuse code. Currently, the following piece of code is also copied for the scenario when user clicks on the footer in file mode
                            $('.footer-for-server-mode .name-of-file-being-edited')
                                .html(htmlEscape(getFileNameFromPath(file.path)))
                                .attr('title', file.path)
                                .css({marginRight: 75})
                                .animate({marginRight: 0}, 1000)
                                .fadeOut(100)
                                .fadeIn(750);
                            if (!options.skipNotifications) {
                                utils.alertNote(
                                    'Auto-save changes for: <span style="font-weight:normal;">' + htmlEscape(file.path) + '</span>',
                                    5000,
                                    {
                                        backgroundColor: 'lightgreen',
                                        borderColor: 'darkgreen'
                                    }
                                );
                            }
                            await editor.setTextValue(file.contents);
                            await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                            editor.focus();

                            // Clear the undo-redo hstory
                            editor.cm.clearHistory();
                        });
                    } else {
                        editor.options.rememberText = true;

                        // If previous mode was 'file'
                        if (getLanguageMode() === 'file') {
                            // Restore the saved code
                            await editor.setTextValue(editor.userPreference('textarea-value'));
                            await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});

                            // Clear the undo-redo hstory
                            editor.cm.clearHistory();
                        }

                        socketOb.flagEditingFile = false;
                        await socketOb._disconnectIfRequiredServerHelper();
                        // $('.footer-for-server-mode').hide();
                        // editor.adjustUiPosition();

                        if (newLanguageMode === 'less') {
                            setLanguageModeClass(editor, 'magicss-selected-mode-less');
                            await editor.userPreference('language-mode', 'less');
                            editor.cm.setOption('mode', 'text/x-less');
                            await setCodeMirrorCSSLinting(editor, 'disable');
                            if (!options.skipNotifications) {
                                utils.alertNote('Now editing code in LESS mode', 5000);
                            }
                        } else if (newLanguageMode === 'sass') {
                            setLanguageModeClass(editor, 'magicss-selected-mode-sass');
                            await editor.userPreference('language-mode', 'sass');
                            editor.cm.setOption('mode', 'text/x-scss');
                            await setCodeMirrorCSSLinting(editor, 'disable');
                            if (!options.skipNotifications) {
                                utils.alertNote('Now editing code in SASS mode', 5000);
                            }
                        } else {
                            setLanguageModeClass(editor, 'magicss-selected-mode-css');
                            await editor.userPreference('language-mode', 'css');
                            editor.cm.setOption('mode', 'text/css');
                            if (!options.skipNotifications) {
                                utils.alertNote('Now editing code in CSS mode', 5000);
                            }
                        }
                        await fnApplyTextAsCSS(editor, {
                            skipNotifications: options.skipNotifications
                        });
                    }
                };

                var getLanguageMode = function () {
                    var $el = $('#' + id),
                        mode;
                    if ($el.hasClass('magicss-selected-mode-file')) {
                        mode = 'file';
                    } else if ($el.hasClass('magicss-selected-mode-less')) {
                        mode = 'less';
                    } else if ($el.hasClass('magicss-selected-mode-sass')) {
                        mode = 'sass';
                    } else {
                        mode = 'css';
                    }
                    return mode;
                };

                var getMagicCSSForChrome = null,
                    // getMagicCSSForEdge = null,
                    getMagicCSSForFirefox = null;
                if (!isChrome) {
                    getMagicCSSForChrome = {
                        name: 'get-magic-css-for-chrome',
                        title: 'Magic CSS for Chrome',
                        uniqCls: 'get-magic-css-for-chrome',
                        href: extensionUrl.chrome
                    };
                }
                // if (!isEdge) {
                //     getMagicCSSForEdge = {
                //         name: 'get-magic-css-for-edge',
                //         title: 'Magic CSS for Edge',
                //         uniqCls: 'get-magic-css-for-edge',
                //         href: extensionUrl.edge
                //     };
                // }
                if (!isFirefox) {
                    getMagicCSSForFirefox = {
                        name: 'get-magic-css-for-firefox',
                        title: 'Magic CSS for Firefox',
                        uniqCls: 'get-magic-css-for-firefox',
                        href: extensionUrl.firefox
                    };
                }

                var iconForRateUs = function (options) {
                    options = options || {};
                    var icon = null;
                    if (isChrome || isEdge || isFirefox || isOpera) {
                        if (isChrome) {
                            icon = {
                                name: 'rate-on-webstore',
                                title: 'Rate us on Chrome Web Store',
                                cls: 'magicss-rate-on-webstore',
                                uniqCls: 'icon-chrome-web-store',
                                href: extensionUrl.chrome + '/reviews'
                            };
                        } else if (isEdge) {
                            icon = {
                                name: 'rate-on-webstore',
                                title: 'Rate us on Microsoft Store',
                                cls: 'magicss-rate-on-webstore',
                                uniqCls: 'icon-microsoft-store',
                                href: extensionUrl.edge + '#ratings-reviews'
                            };
                        } else if (isFirefox) {
                            icon = {
                                name: 'rate-on-webstore',
                                title: 'Rate us on Firefox Add-ons Store',
                                cls: 'magicss-rate-on-webstore',
                                uniqCls: 'icon-firefox-add-ons-store',
                                href: extensionUrl.firefox + 'reviews/'
                            };
                        } else if (isOpera) {
                            icon = {
                                name: 'rate-on-webstore',
                                title: 'Rate us on Opera Add-ons Store',
                                cls: 'magicss-rate-on-webstore',
                                uniqCls: 'icon-opera-add-ons-store',
                                href: extensionUrl.opera + '#feedback-container'
                            };
                        }
                        if (icon && icon.cls) {
                            if (options.addOpaqueOnHoverClass) {
                                icon.cls += ' editor-opaque-on-hover';
                            }
                        }
                    }
                    return icon;
                };

                var togglePointAndClick = function (editor) {
                    if (enablePointAndClick) {
                        disablePointAndClickFunctionality(editor);
                    } else {
                        var currentSelection = editor.cm.getSelection();
                        if (currentSelection) {
                            var currentCursorPosition = editor.cm.getCursor();
                            editor.setCursor(currentCursorPosition, {pleaseIgnoreCursorActivity: true});
                        }

                        // Just a logical block
                        {
                            var cursorPosition = editor.cm.getCursor();
                            var splitText = editor.splitTextByCursor();
                            var lastIndexOfClosingBraceBeforeCursor = splitText.strBeforeCursor.lastIndexOf('}');
                            var lastIndexOfOpeningBraceBeforeCursor = splitText.strBeforeCursor.lastIndexOf('{');

                            var firstIndexOfClosingBraceAfterCursor = splitText.strAfterCursor.indexOf('}');

                            var adjustCursorPosition = function (delta) {
                                var targetPosition = editor.cm.findPosH(cursorPosition, delta, 'char', false);
                                editor.setCursor(targetPosition, {pleaseIgnoreCursorActivity: true});
                            };

                            var moveCursorToEndOfLineIfRequired = function () {
                                // If there is any non-whitespace character before the cursor in the current line
                                if (editor.cm.getLine(cursorPosition.line).substr(0, cursorPosition.ch).trim()) {
                                    // Move the cursor to the end of the current line
                                    // Which helps in avoiding the scenario that when the user does point-and-click,
                                    // the text insertion does not happen in the middle of the text
                                    editor.setCursor({line: cursorPosition.line}, {pleaseIgnoreCursorActivity: true});
                                }
                            };

                            if (
                                lastIndexOfOpeningBraceBeforeCursor >= 0 &&
                                lastIndexOfClosingBraceBeforeCursor < lastIndexOfOpeningBraceBeforeCursor
                            ) {
                                if (firstIndexOfClosingBraceAfterCursor >= 0) {
                                    adjustCursorPosition(firstIndexOfClosingBraceAfterCursor + 1);
                                } else {
                                    moveCursorToEndOfLineIfRequired();
                                }
                            } else {
                                var anyNonWhitespaceCharacterBetweenLastClosingBracketAndCurrentCursorPosition = !!(splitText.strBeforeCursor.substring(lastIndexOfClosingBraceBeforeCursor + 1).trim());
                                if (anyNonWhitespaceCharacterBetweenLastClosingBracketAndCurrentCursorPosition) {
                                    if (firstIndexOfClosingBraceAfterCursor >= 0) {
                                        adjustCursorPosition(firstIndexOfClosingBraceAfterCursor + 1);
                                    } else {
                                        moveCursorToEndOfLineIfRequired();
                                    }
                                }
                            }
                        }

                        utils.alertNote('Select an element in the page to generate its CSS selector<br />(Shortcut: Alt + Shift + S)', 5000);
                        enablePointAndClickFunctionality(editor);
                    }
                };

                var focusChangeInformationLoggedInConsoleJustNow = false;
                var informUserAboutProblematicFocus = function () {
                    utils.alertNote(
                        'Typing in the Magic CSS editor may not work well.' +
                        '<br />It appears that some JavaScript code running on the page steals focus.' +
                        '<br />Check the "Console" in "Developer tools" for more information.',
                        20000,
                        {
                            backgroundColor: '#f5bcae',
                            borderColor: '#e87457'
                        }
                    );

                    if (!focusChangeInformationLoggedInConsoleJustNow) {
                        // References:
                        //    https://github.com/webextensions/live-css-editor/issues/4
                        //    https://github.com/zenorocha/clipboard.js/wiki/Known-Issues
                        console.log(
                            '************************* Note *************************' +
                            '\nTyping in the Magic CSS editor may not work well.' +
                            '\nIt appears that some JavaScript code running on the page steals focus.' +
                            '\nYou may need to workaround the problematic JavaScript code to avoid this problem.' +
                            '\n' +
                            '\nHow to workaround this problem?' +
                            '\n* If you are using jQuery UI, try executing:' +
                            // eg: https://jqueryui.com/resources/demos/dialog/modal-message.html
                            '\n    jQuery.ui.dialog.prototype._focusTabbable = jQuery.noop;' +
                            // eg: Open modal at https://www.w3schools.com/bootstrap/bootstrap_modal.asp
                            '\n* If you are using Bootstrap 3, try executing:' +
                            '\n    jQuery.fn.modal.Constructor.prototype.enforceFocus = function() {};      // You may need to close and reopen the modal dialog' +
                            // eg: Open modal at https://getbootstrap.com/docs/4.1/components/modal/
                            '\n* If you are using Bootstrap 4 or later, try executing:' +
                            '\n    jQuery.fn.modal.Constructor.prototype._enforceFocus = function() {};     // You may need to close and reopen the modal dialog' +
                            '\n' +
                            '\nFor more details, kindly refer to:' +
                            '\n    https://github.com/webextensions/live-css-editor/issues/4' +
                            '\n\n'
                        );
                        focusChangeInformationLoggedInConsoleJustNow = true;
                        setTimeout(function () {
                            focusChangeInformationLoggedInConsoleJustNow = false;
                        }, 100);
                    }
                };

                var options = {
                    id: id,
                    title: function ($, editor) {
                        var $outer = $('<div></div>'),
                            $titleItems = $('<div class="magicss-title"></div>');
                        $outer.append($titleItems);
                        $titleItems.append(
                            '<div class="magicss-mode-button magicss-mode-file" title="File mode">' +
                                '<span class="file-mode-is-beta">' +
                                    '&nbsp;This is a BETA feature&nbsp;' +
                                '</span>' +
                                'file' +
                            '</div>' +
                            '<div class="magicss-mode-button magicss-mode-css" title="CSS mode">css</div>' +
                            '<div class="magicss-mode-button magicss-mode-less" title="Less mode">less</div>' +
                            '<div class="magicss-mode-button magicss-mode-sass" title="Sass mode">sass</div>'
                        );

                        $(document).on('click', '.magicss-mode-css', async function () {
                            await setLanguageMode('css', editor);
                            editor.focus();
                        });
                        $(document).on('click', '.magicss-mode-less', async function () {
                            await setLanguageMode('less', editor);
                            editor.focus();
                        });
                        $(document).on('click', '.magicss-mode-sass', async function () {
                            await setLanguageMode('sass', editor);
                            editor.focus();
                        });
                        $(document).on('click', '.magicss-mode-file', async function () {
                            await setLanguageMode('file', editor);
                            editor.focus();
                        });

                        return $outer;
                    },
                    placeholder: 'Write CSS/Less/Sass code here.\nThe code gets applied immediately.\n\nExample:' + '\nimg {\n    opacity: 0.5;\n}' + '\n\nShortcut: Alt + Shift + C',
                    codemirrorOptions: {
                        colorpicker: {
                            mode: 'edit'
                        },
                        // autoCloseBrackets: true,
                        /*
                        hintOptions: {
                            completeSingle: false,
                            // closeCharacters: /[\s()\[\]{};:>,]/,     // This is the default value defined in show-hint.js
                            closeCharacters: /[(){};:,]/,               // Custom override
                            onAddingAutoCompleteOptionsForSelector: (
                                // FIXME: This would not work since window.MagiCSSEditor is not available yet
                                (await window.MagiCSSEditor.userPreference(USER_PREFERENCE_AUTOCOMPLETE_SELECTORS)) === 'no'
                                    ? null
                                    : (
                                        function (add) {
                                            if (existingCSSSelectorsWithAutocompleteObjects) {
                                                add(existingCSSSelectorsWithAutocompleteObjects, true);
                                            }
                                        }
                                    )
                            ),
                            onAddingAutoCompleteOptionsForCSSProperty: function (add) {
                                add(cssPropertyKeywordsAutocompleteObject, true);
                            },
                            onCssHintSelectForSelector: function (selectedText) {
                                var editor = window.MagiCSSEditor;
                                showCSSSelectorMatches(selectedText, editor);
                            },
                            onCssHintShownForSelector: function () {    // As per current CodeMirror/css-hint architecture,
                                                                        // "select" is called before "shown".
                                                                        // The "select" operation would also show the number  e are hiding the alertNote
                                utils.alertNote.hide();
                            }
                        },
                        /* */
                        extraKeys: {
                            /*
                            // https://blog.github.com/2018-02-18-deprecation-notice-removing-anonymous-gist-creation/
                            'Ctrl-S': function () {
                                var editor = window.MagiCSSEditor;
                                createGistAndEmail(editor.getTextValue(), getLanguageMode());
                                editor.focus();
                            }
                            /* */
                        },
                        optionsBasedOnUserPreference: async function (userPreference) {
                            var options = {};

                            if ((await userPreference('use-css-linting')) === 'yes' && (await userPreference('language-mode')) === 'css') {
                                options.gutters = ['CodeMirror-lint-markers'];
                                options.lint = true;
                            } else {
                                options.gutters = [];
                                options.lint = false;
                            }

                            if ((await userPreference('language-mode')) === 'sass') {
                                options.mode = 'text/x-scss';
                            } else if ((await userPreference('language-mode')) === 'less') {
                                options.mode = 'text/x-less';
                            } else {
                                options.mode = 'text/css';
                            }


                            // options.hintOptions = {
                            //     // completeSingle: false,
                            //     // closeCharacters: /[\s()\[\]{};:>,]/,     // This is the default value defined in show-hint.js
                            //     // closeCharacters: /[(){};:,]/,               // Custom override
                            //     // closeCharacters: null,               // Custom override
                            //     closeCharacters: /[,]/,               // Custom override
                            //     onAddingAutoCompleteOptionsForSelector: (
                            //         (await userPreference(USER_PREFERENCE_AUTOCOMPLETE_SELECTORS)) === 'no'
                            //             ? null
                            //             : (
                            //                 function (add) {
                            //                     if (existingCSSSelectorsWithAutocompleteObjects) {
                            //                         add(existingCSSSelectorsWithAutocompleteObjects, true);
                            //                     }
                            //                 }
                            //             )
                            //     ),
                            //     onAddingAutoCompleteOptionsForCSSProperty: (
                            //         (await userPreference(USER_PREFERENCE_AUTOCOMPLETE_CSS_PROPERTIES_AND_VALUES)) === 'no'
                            //             ? (
                            //                 function noop() {
                            //                     // do nothing
                            //                 }
                            //             )
                            //             : (
                            //                 function (add) {
                            //                     add(cssPropertyKeywordsAutocompleteObject, true);
                            //                 }
                            //             )
                            //     ),
                            //     onCssHintSelectForSelector: function (selectedText) {
                            //         var editor = window.MagiCSSEditor;
                            //         showCSSSelectorMatches(selectedText, editor);
                            //     },
                            //     onCssHintShownForSelector: function () {    /* As per current CodeMirror/css-hint architecture,
                            //                                                    "select" is called before "shown".
                            //                                                    The "select" operation would also show the number  e are hiding the alertNote */
                            //         utils.alertNote.hide();
                            //     }
                            // };

                            return options;
                        }
                    },
                    // bgColor: '68,88,174,0.85',
                    bgColor: '99,113,186,1',
                    headerIcons: [
                        (function () {
                            if (executionCounter < const_rateUsUsageCounterFrom || const_rateUsUsageCounterTo <= executionCounter) {
                                return null;
                            } else {
                                return iconForRateUs({addOpaqueOnHoverClass: true});
                            }
                        }()),
                        (function () {
                            // Currently, this feature has been tested only in Chrome, Opera and Edge browsers
                            if (isChrome || isOpera || isEdge || isFirefox) {
                                return {
                                    name: 'reapply',
                                    title: 'Apply styles automatically\n(without loading this extension, for pages on this domain)',
                                    cls: 'magicss-reapply-styles editor-gray-out',
                                    onclick: async function (evt, editor, divIcon) {
                                        if ($(divIcon).parents('#' + id).hasClass('magic-css-apply-styles-automatically')) {
                                            await markAsPinnedOrNotPinned(editor, 'not-pinned');
                                            utils.alertNote(
                                                '<span style="font-weight:normal;">Now onwards,</span> styles would be applied only when you load this extension <span style="font-weight:normal;"><br/>(for pages on <span style="text-decoration:underline;">' + window.location.origin + '</span>)</span>',
                                                5000
                                            );
                                        } else {
                                            if (isFirefox) {
                                                await markAsPinnedOrNotPinned(editor, 'pinned');
                                                utils.alertNote(
                                                    '<span style="font-weight:normal;">Now onwards, </span>apply styles automatically <span style="font-weight:normal;">without loading this extension<br/>(for pages on <span style="text-decoration:underline;">' + window.location.origin + '</span>)</span>',
                                                    10000
                                                );
                                            } else {
                                                chrome.runtime.sendMessage(
                                                    {
                                                        requestPermissions: true,
                                                        url: window.location.href
                                                    },
                                                    async function asyncCallback(status) {
                                                        if (chrome.runtime.lastError) {
                                                            console.log('Error message reported by Magic CSS:', chrome.runtime.lastError);
                                                            utils.alertNote(
                                                                'Error! Unexpected error encountered by Magic CSS extension.<br />You may need to reload webpage & Magic CSS and try again.',
                                                                10000
                                                            );
                                                        }
                                                        if (status === 'request-granted') {
                                                            await markAsPinnedOrNotPinned(editor, 'pinned');
                                                            utils.alertNote(
                                                                '<span style="font-weight:normal;">Now onwards, </span>apply styles automatically <span style="font-weight:normal;">without loading this extension<br/>(for pages on <span style="text-decoration:underline;">' + window.location.origin + '</span>)</span>',
                                                                10000
                                                            );
                                                        } else if (status === 'request-not-granted') {
                                                            utils.alertNote('You need to provide permissions to reapply styles automatically', 10000);
                                                        }
                                                    }
                                                );
                                            }
                                        }
                                        editor.focus();
                                    }
                                };
                            } else {
                                return null;
                            }
                        }()),
                        {
                            name: 'disable',
                            title: 'Deactivate code',
                            cls: 'magicss-disable-css editor-gray-out',
                            onclick: async function (evt, editor, divIcon) {
                                if ($(divIcon).parents('#' + id).hasClass('indicate-disabled')) {
                                    await editor.disableEnableCSS('enable');
                                } else {
                                    await editor.disableEnableCSS('disable');
                                }
                                // editor.focus();
                            },
                            afterrender: function (editor, divIcon) {
                                // TODO: Make the code independent of this setTimeout logic.
                                setTimeout(function () {
                                    if ($(divIcon).parents('#' + id).hasClass('indicate-disabled')) {
                                        divIcon.title = 'Activate code';
                                    } else {
                                        divIcon.title = 'Deactivate code';
                                    }
                                }, 0);

                                /* HACK: Remove this hack which is being used to handle "divIcon.title" change
                                         for the case of "editor.disableEnableCSS('disable')" under "reInitialized()" */
                                editor.originalDisableEnableCSS = editor.disableEnableCSS;
                                editor.disableEnableCSS = async function (doWhat) {
                                    var state = await editor.originalDisableEnableCSS(doWhat);
                                    if (state === 'disabled') {
                                        divIcon.title = 'Activate code';
                                    } else {
                                        divIcon.title = 'Deactivate code';
                                    }
                                    return state;
                                };
                            }
                        },
                        /*
                        {
                            name: 'beautify',
                            title: 'Beautify code',
                            cls: 'magicss-beautify editor-gray-out',
                            onclick: async function (evt, editor) {
                                var textValue = editor.getTextValue();
                                if (!textValue.trim()) {
                                    utils.alertNote('Please type some code to be beautified', 5000);
                                } else {
                                    var beautifiedCSS = await beautifyCSS(textValue);
                                    if (textValue.trim() !== beautifiedCSS.trim()) {
                                        await editor.setTextValue(beautifiedCSS);
                                        await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Your code has been beautified :-)', 5000);
                                    } else {
                                        utils.alertNote('Your code already looks beautiful :-)', 5000);
                                    }
                                }
                                editor.focus();
                            }
                        },
                        /* */
                        {
                            name: 'css-reloader-and-file-changes-watcher',
                            title: 'CSS reloader and watch file changes',
                            cls: 'magicss-reload-css-resources editor-gray-out cancelDragHandle',
                            icons: [
                                (function () {
                                    if (isChrome || isOpera || isEdge || isFirefox) {
                                        return {
                                            name: 'stopWatchingCssFiles',
                                            title: 'Stop watching CSS files',
                                            // cls: 'magicss-watch-resources',
                                            uniqCls: 'magicss-stop-watch-and-reload-link-tags',
                                            onclick: async function (evt, editor) {
                                                await socketOb._stopWatchingFiles(editor);
                                                editor.focus();
                                            }
                                        };
                                    } else {
                                        return null;
                                    }
                                }()),
                                (function () {
                                    if (isChrome || isOpera || isEdge || isFirefox) {
                                        return {
                                            name: 'watchCssFiles',
                                            title: 'Watch CSS files to apply changes automatically',
                                            // cls: 'magicss-watch-resources',
                                            uniqCls: 'magicss-watch-and-reload-link-tags',
                                            onclick: async function (evt, editor) {
                                                await socketOb._startWatchingFiles(editor);
                                                editor.focus();
                                            },
                                            beforeShow: function (origin, tooltip) {
                                                tooltip.addClass(socketOb.flagWatchingCssFiles ? 'tooltipster-watching-css-files-enabled' : 'tooltipster-watching-css-files-disabled');
                                            }
                                        };
                                    } else {
                                        return null;
                                    }
                                }()),
                                {
                                    name: 'reload-css-resources',
                                    title: 'Reload all CSS resources',
                                    cls: 'magicss-reload-all-css-resources',
                                    uniqCls: 'magicss-reload-all-css-resources',
                                    onclick: function (evt, editor) {
                                        reloadAllCSSResourcesInPage();
                                        editor.focus();
                                    }
                                }
                            ]
                        },
                        {
                            name: 'point-and-click',
                            title: 'Select an element in the page to generate its CSS Selector \n(Shortcut: Alt + Shift + S)',
                            cls: 'magicss-point-and-click',
                            onclick: function (evt, editor) {
                                togglePointAndClick(editor);
                                editor.focus();
                            }
                        }
                    ],
                    headerOtherIcons: [
                        (function () {
                            if (executionCounter < const_rateUsUsageCounterTo) {
                                return null;
                            } else {
                                return iconForRateUs();
                            }
                        }()),
                        {
                            name: 'less-or-sass-to-css',
                            title: 'Convert this code from Less/Sass to CSS',
                            uniqCls: 'magicss-less-or-sass-to-css',
                            onclick: async function (evt, editor) {
                                if (getLanguageMode() === 'less') {
                                    var lessCode = editor.getTextValue();
                                    if (!lessCode.trim()) {
                                        await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Please type some LESS code to use this feature', 5000);
                                        editor.focus();
                                    } else {
                                        utils.lessToCSS(lessCode, async function asyncCallback(err, cssCode) {
                                            if (err) {
                                                utils.alertNote(
                                                    'Invalid LESS syntax.' +
                                                    '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                                    '<br />Error message: ' + err.message,
                                                    10000
                                                );
                                                highlightErroneousLineTemporarily(editor, err.line - 1);
                                                editor.setCursor({line: err.line - 1, ch: err.column}, {pleaseIgnoreCursorActivity: true});
                                            } else {
                                                var beautifiedLessCode = await beautifyCSS(utils.minifyCSS(lessCode));
                                                cssCode = await beautifyCSS(utils.minifyCSS(cssCode));

                                                if (cssCode === beautifiedLessCode) {
                                                    utils.alertNote('Your code is already CSS compatible', 5000);
                                                } else {
                                                    await editor.setTextValue(cssCode);
                                                    await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                                    utils.alertNote('Your code has been converted from Less to CSS :-)' + noteForUndo, 5000);
                                                }
                                            }
                                            editor.focus();
                                        });
                                    }
                                } else if (getLanguageMode() === 'sass') {
                                    var sassCode = editor.getTextValue();
                                    if (!sassCode.trim()) {
                                        await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Please type some SASS code to use this feature', 5000);
                                        editor.focus();
                                    } else {
                                        utils.sassToCSS(sassCode, async function asyncCallback(err, cssCode) {
                                            if (err) {
                                                utils.alertNote(
                                                    'Invalid SASS syntax.' +
                                                    '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                                    '<br />Error message: ' + err.message,
                                                    10000
                                                );
                                                highlightErroneousLineTemporarily(editor, err.line - 1);
                                                editor.setCursor({line: err.line - 1, ch: err.column}, {pleaseIgnoreCursorActivity: true});
                                            } else {
                                                var beautifiedSassCode = await beautifyCSS(utils.minifyCSS(sassCode));
                                                cssCode = await beautifyCSS(utils.minifyCSS(cssCode));

                                                if (cssCode === beautifiedSassCode) {
                                                    utils.alertNote('Your code is already CSS compatible', 5000);
                                                } else {
                                                    await editor.setTextValue(cssCode);
                                                    await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                                    utils.alertNote('Your code has been converted from Sass to CSS :-)' + noteForUndo, 5000);
                                                }
                                            }
                                            editor.focus();
                                        });
                                    }
                                } else {
                                    utils.alertNote('Please switch to editing code in Less/Sass mode to enable this feature', 5000);
                                    editor.focus();
                                }
                            },
                            beforeShow: async function (origin, tooltip, editor) {
                                // TODO: Move the .addClass() calls to their corresponding .beforeShow()
                                tooltip
                                    .addClass(function () {
                                        switch(getLanguageMode()) {
                                            case 'file':    return 'tooltipster-selected-mode-file';
                                            case 'less':    return 'tooltipster-selected-mode-less';
                                            case 'sass':    return 'tooltipster-selected-mode-sass';
                                            default:        return 'tooltipster-selected-mode-css';
                                        }
                                    }())
                                    .addClass(editor.cm.getOption('lineNumbers') ? 'tooltipster-line-numbers-enabled' : 'tooltipster-line-numbers-disabled')
                                    .addClass(editor.cm.getOption('lint') ? 'tooltipster-css-linting-enabled' : 'tooltipster-css-linting-disabled')
                                    // FIXME: Probably tooltipster-autocomplete-selectors-disabled/enabled is not used anymore
                                    .addClass((await editor.userPreference(USER_PREFERENCE_AUTOCOMPLETE_SELECTORS)) === 'no' ? 'tooltipster-autocomplete-selectors-disabled' : 'tooltipster-autocomplete-selectors-enabled');
                            }
                        },
                        /*
                        {
                            name: 'css-to-less',
                            title: 'Convert this code from CSS to LESS',
                            uniqCls: 'magicss-css-to-less',
                            onclick: function () {
                                console.log('Step 1. Read the text');
                                console.log('Step 2. Try to convert that text from CSS to LESS');
                                console.log('Step 3. If successful, change editing mode from CSS to LESS');
                                console.log('Step 4. Notify the user about this change');
                            },
                            beforeShow: function (origin, tooltip) {
                                if (getLanguageMode() === 'css') {
                                    tooltip.addClass('tooltipster-selected-mode-css');
                                }
                            }
                        },
                        /* */

                        /*
                        {
                            name: 'reload-css-resources',
                            title: 'Reload CSS resources',
                            uniqCls: 'magicss-reload-css-resources',
                            onclick: function (evt, editor) {
                                reloadAllCSSResourcesInPage();
                                editor.focus();
                            }
                        },
                        /* */
                        {
                            name: 'beautify',
                            title: 'Beautify code',
                            uniqCls: 'magicss-beautify',
                            onclick: async function (evt, editor) {
                                var textValue = editor.getTextValue();
                                if (!textValue.trim()) {
                                    utils.alertNote('Please type some code to be beautified', 5000);
                                } else {
                                    var beautifiedCSS = await beautifyCSS(textValue);
                                    if (textValue.trim() !== beautifiedCSS.trim()) {
                                        await editor.setTextValue(beautifiedCSS);
                                        await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Your code has been beautified :-)', 5000);
                                    } else {
                                        utils.alertNote('Your code already looks beautiful :-)', 5000);
                                    }
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'minify',
                            title: 'Minify code',
                            uniqCls: 'magicss-minify',
                            onclick: async function (evt, editor) {
                                var textValue = editor.getTextValue();
                                if (!textValue.trim()) {
                                    await editor.setTextValue('');
                                    await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                    utils.alertNote('Please type some code to be minified', 5000);
                                } else {
                                    var minifiedCSS = utils.minifyCSS(textValue);
                                    if (textValue !== minifiedCSS) {
                                        await editor.setTextValue(minifiedCSS);
                                        await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Your code has been minified' + noteForUndo, 5000);
                                    } else {
                                        utils.alertNote('Your code is already minified', 5000);
                                    }
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'showLineNumbers',
                            title: 'Show line numbers',
                            uniqCls: 'magicss-show-line-numbers',
                            onclick: async function (evt, editor) {
                                editor.cm.setOption('lineNumbers', true);
                                await editor.userPreference('show-line-numbers', 'yes');
                                editor.focus();
                            }
                        },
                        {
                            name: 'hideLineNumbers',
                            title: 'Hide line numbers',
                            uniqCls: 'magicss-hide-line-numbers',
                            onclick: async function (evt, editor) {
                                editor.cm.setOption('lineNumbers', false);
                                await editor.userPreference('show-line-numbers', 'no');
                                editor.focus();
                            }
                        },
                        {
                            name: 'enableCSSLinting',
                            title: 'Enable CSS linting',
                            uniqCls: 'magicss-enable-css-linting',
                            onclick: async function (evt, editor) {
                                if (getLanguageMode() === 'css') {
                                    await setCodeMirrorCSSLinting(editor, 'enable');
                                } else {
                                    utils.alertNote('Please switch to editing code in CSS mode to enable this feature', 5000);
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'disableCSSLinting',
                            title: 'Disable CSS linting',
                            uniqCls: 'magicss-disable-css-linting',
                            onclick: async function (evt, editor) {
                                if (getLanguageMode() === 'css') {
                                    await setCodeMirrorCSSLinting(editor, 'disable');
                                } else {
                                    utils.alertNote('Please switch to editing code in CSS mode to enable this feature', 5000);
                                }
                                editor.focus();
                            }
                        },
                        /*
                        // https://blog.github.com/2018-02-18-deprecation-notice-removing-anonymous-gist-creation/
                        {
                            name: 'gist',
                            title: 'Mail code (via Gist)',
                            uniqCls: 'magicss-email',
                            onclick: function (evt, editor) {
                                createGistAndEmail(editor.getTextValue(), getLanguageMode());
                                editor.focus();
                            }
                        },
                        /* */
                        getMagicCSSForChrome,
                        // getMagicCSSForEdge,
                        getMagicCSSForFirefox,
                        {
                            name: 'tweet',
                            title: 'Tweet',
                            uniqCls: 'magicss-tweet',
                            href: 'http://twitter.com/intent/tweet?url=' + encodeURIComponent(extensionUrl.forThisBrowser) + '&text=' + encodeURIComponent(extLib.TR('Extension_Name', 'Live editor for CSS, Less & Sass - Magic CSS')) + ' (for Chrome%2C Edge %26 Firefox) ... web devs check it out!&via=webextensions'
                        },
                        {
                            name: 'share-on-facebook',
                            title: 'Share',
                            uniqCls: 'magicss-share-on-facebook',
                            href: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(extensionUrl.forThisBrowser)
                        },
                        {
                            name: 'github-repo',
                            title: 'Contribute / Report issue',
                            uniqCls: 'magicss-github-repo',
                            href: 'https://github.com/webextensions/live-css-editor'
                        },
                        {
                            name: 'options',
                            title: 'More options',
                            uniqCls: 'magicss-options',
                            onclick: function (evt, editor) {
                                try {
                                    chrome.runtime.sendMessage({openOptionsPage: true});
                                } catch (e) {
                                    console.log('Error message reported by Magic CSS:', e);
                                    utils.alertNote(
                                        'Error! Unexpected error encountered by Magic CSS extension.<br />You may need to reload webpage & Magic CSS and try again.',
                                        10000
                                    );
                                    try {
                                        var href = chrome.runtime.getURL('options.html');
                                        if (href) {
                                            utils.alertNote(
                                                'Configure more options for Magic CSS by going to the following address in a new tab:<br />' + href,
                                                15000
                                            );
                                        }
                                    } catch (e) {
                                        // do nothing
                                    }
                                }
                                editor.focus();
                            }
                        }
                    ],
                    footer: function ($, editor) {
                        var $footerItems = $('<div></div>'),
                            $status = $('<div class="magicss-status"></div>');
                        $footerItems.append($status);

                        var $footerForServerMode = $('<div class="footer-for-server-mode" style="display:none;margin-top:3px;margin-bottom:-4px;overflow:auto"></div>');
                        $footerItems.append($footerForServerMode);

                        var $fileToEdit = $(
                            '<div class="file-to-edit">' +
                                '<div class="name-of-file-being-edited" style="color:#fff; cursor:pointer"></div>' +
                            '</div>'
                        );
                        var $fileEditStatus = $('<div class="file-edit-status" style="color:#fff"></div>');
                        var $liveCssServerStatus = $('<div class="live-css-server-status"></div>');
                        $footerForServerMode.append($fileToEdit);
                        $footerForServerMode.append($liveCssServerStatus);
                        $footerForServerMode.append($fileEditStatus);

                        /*
                        // Magic Suggest uses old jQuery code. Minor changes to fix that
                        jQuery.fn.extend({
                            size: function() {
                                return this.length;
                            }
                        });
                        setTimeout(function () {
                            // $.ajax({
                            //     method: 'PUT',
                            //     url: 'http://localhost:3456/magic-css/asdf.txt'
                            //     // url: 'http://localhost:3456/magic-css/asdf.txt'
                            //     // url: 'http://localhost:3456/asdf.txt'
                            //     // url: 'http://localhost:3456/asdf.txt'
                            // });
                            var fileSuggestions = $('#magicss-file-to-edit').magicSuggest({
                                method: 'GET',
                                data: 'http://localhost:3456/magic-css?query=asdf'
                                // data: [{"id":"Paris", "name":"Paris"}, {"id":"New York", "name":"New York"}]
                                // data: 'random.json',
                                // renderer: function(data){
                                //     // debugger;
                                //     return '<div style="padding: 5px; overflow:hidden;">' +
                                //     // '<div style="float: left;"><img src="' + data.picture + '" /></div>' +
                                //     '<div style="float: left; margin-left: 5px">' +
                                //     '<div style="font-weight: bold; color: #333; font-size: 10px; line-height: 11px">' + data.name + '</div>' +
                                //     '<div style="color: #999; font-size: 9px">' + data.name + '</div>' +
                                //     '</div>' +
                                //     '</div><div style="clear:both;"></div>'; // make sure we have closed our dom stuff
                                // }
                            });
                            window.fileSuggestions = fileSuggestions;
                            // fileSuggestions.expand();
                            $(fileSuggestions).on('selectionchange', function(e, m){
                                $.ajax({
                                    url: 'http://localhost:3456/' + this.getValue()[0],
                                    success: function (data, textStatus) {
                                        if (textStatus === 'success') {
                                            await editor.setTextValue(data).reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        }
                                    }
                                });
                            });
                        }, 0);
                        $selectLinkTag.on('mousedown', function (evt) {
                            evt.stopPropagation();
                        });
                        // $selectLinkTag.on('click', function (evt) {
                        //     $;
                        //     $selectLinkTag;
                        //     debugger;
                        // });
                        /* */

                        // $footerItems.on('mousedown', function (evt) {
                        //     evt.stopPropagation();
                        // });

                        $liveCssServerStatus.on('click', async function () {
                            // TODO: Verify functionality
                            await _getServerDetailsFromUser(editor);
                        });

                        $fileToEdit.on('click', async function () {
                            await getDataForFileToEdit(editor, {showUi: true}, async function (file) {
                                // TODO: Fix this code related to "getFileNameFromPath" (it is not in a consistent state after the rebase operation)
                                // TODO: Reuse code. Currently, the following piece of code is also copied for the scenario when user switches the editing mode
                                $('.footer-for-server-mode .name-of-file-being-edited')
                                    .html(htmlEscape(getFileNameFromPath(file.path)))
                                    .attr('title', file.path)
                                    .css({marginRight: 75})
                                    .animate({marginRight: 0}, 1000)
                                    .fadeOut(100)
                                    .fadeIn(750);
                                utils.alertNote(
                                    'Auto-save changes for: <span style="font-weight:normal;">' + htmlEscape(file.path) + '</span>',
                                    5000,
                                    {
                                        backgroundColor: 'lightgreen',
                                        borderColor: 'darkgreen'
                                    }
                                );

                                await editor.setTextValue(file.contents);
                                await editor.reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                editor.focus();

                                // Clear the undo-redo hstory
                                editor.cm.clearHistory();
                            });
                        });

                        // Magic Suggest uses old jQuery code. Minor changes to fix that
                        jQuery.fn.extend({
                            size: function() {
                                return this.length;
                            }
                        });

                        // The following DOM elements are added just to cache some Magic CSS icons/images which may otherwise fail to load on a
                        // domain with CSP settings like:
                        //     "Content-Security-Policy:default-src 'self'"
                        // which may block the load of data URI based SVG images
                        $footerItems.append(
                            '<div style="width:0;height:0;opacity:0">' +    // Using display:none wouldn't help in caching the background-image style
                                '<div class="magicss-cache-image-to-prevent-CSP-problem-point-and-click-hover"></div>' +
                                '<div class="magicss-cache-image-to-prevent-CSP-problem-css-linting"></div>' +
                                '<div class="magicss-cache-image-to-prevent-CSP-problem-disable-css-linting"></div>' +
                                '<div class="magicss-cache-image-to-prevent-CSP-problem-hide-line-numbers"></div>' +
                                '<div class="magicss-cache-image-to-prevent-CSP-problem-show-line-numbers"></div>' +
                            '</div>'
                        );
                        return $footerItems;
                    },
                    events: {
                        beforeInstantiatingCodeMirror: async function (editor) {
                            // TODO: Cleanup commented out code below and related code/variables elsewhere (code related
                            //       to USER_PREFERENCE_USE_CUSTOM_FONT_SIZE)

                            // Need to add font-styling before CodeMirror is instantiated
                            // if (await editor.userPreference(USER_PREFERENCE_USE_CUSTOM_FONT_SIZE) === 'yes') {
                            var userPrefFontSizeInPx = parseInt(await editor.userPreference(USER_PREFERENCE_FONT_SIZE_IN_PX), 10);
                            // if (userPrefFontSizeInPx !== 12) {
                            var cssLintErrorWarningMarkerSize = 16;
                            if (userPrefFontSizeInPx < 12) {
                                cssLintErrorWarningMarkerSize = Math.round(userPrefFontSizeInPx * 1.2);
                            }
                            utils.addStyleTag({
                                attributes: [{
                                    name: 'data-style-created-by',
                                    value: 'magicss'
                                }],
                                cssText: [
                                    '#' + id + ' *,',
                                    '.alert-note-text,',
                                    '.alert-note-text *,',
                                    '.magic-css-ui,',
                                    '.magic-css-ui *,',
                                    '.tooltipster-content *,',
                                    '.tooltipster-base ul li a,',
                                    '.CodeMirror-hints *,',
                                    '.CodeMirror-lint-message-error,',
                                    '.CodeMirror-lint-message-warning {',
                                    '    font-size: ' + userPrefFontSizeInPx + 'px !important;',
                                    '}',
                                    '.CodeMirror-overwrite .CodeMirror-cursor {',
                                    '    width: ' + Math.round(userPrefFontSizeInPx * 62 / 100) + 'px;',
                                    '}',
                                    '.CodeMirror-lint-tooltip {',
                                    '    max-width: ' + Math.round(600 * userPrefFontSizeInPx / 12) + 'px;',
                                    '}',
                                    '.CodeMirror-lint-marker-error,',
                                    '.CodeMirror-lint-marker-warning {',
                                    '    padding: ' + Math.round(((userPrefFontSizeInPx * 1.2) - cssLintErrorWarningMarkerSize) / 2) + 'px 0;',
                                    (function () {
                                        if (cssLintErrorWarningMarkerSize <= 16) {
                                            var size = cssLintErrorWarningMarkerSize;
                                            return 'width: ' + size + 'px; height: ' + size + 'px;';
                                        }
                                        return '';
                                    }()),
                                    '}',
                                    (function () {
                                        if (userPrefFontSizeInPx < 12) {
                                            return (
                                                '.CodeMirror-lint-message-error, .CodeMirror-lint-message-warning {' +
                                                '    background-size: contain;' +
                                                '}'
                                            );
                                        }
                                        return '';
                                    }())
                                ].join('\n'),
                                parentTag: 'body'
                            });
                            // }
                            // }
                        },
                        launched: async function (editor) {
                            utils.addStyleTag({
                                attributes: [{
                                    name: 'data-style-created-by',
                                    value: 'magicss'
                                }],
                                cssText: (
                                    // Setting display style for UI components generated using this extension
                                    '#' + id + ','
                                    + 'html>body #' + id
                                    + '{'
                                        + 'display: block;'
                                    + '}'
                                ),
                                parentTag: 'body'
                            });

                            utils.addStyleTag({
                                attributes: [{
                                    name: 'data-style-created-by',
                                    value: 'magicss'
                                }],
                                cssText: (
                                    // Setting display style for UI components generated using this extension
                                    '#' + id + ' .cancelDragHandle'
                                    + '{'
                                        + 'cursor: default;'
                                    + '}'
                                ),
                                parentTag: 'body'
                            });

                            var languageMode = await editor.userPreference('language-mode');

                            // Editing mode 'file' is handled outside this if...else block
                            if (languageMode === 'less') {
                                $(editor.container).addClass('magicss-selected-mode-less');
                            } else if (languageMode === 'sass') {
                                $(editor.container).addClass('magicss-selected-mode-sass');
                            } else {
                                $(editor.container).addClass('magicss-selected-mode-css');
                            }

                            if (languageMode === 'file') {
                                await applyLastAppliedCss(editor);

                                // FIXME: Improve the hard-coding done here for the fallback
                                var previousNonFileLanguageMode = await editor.userPreference('language-mode-non-file') || 'css';
                                await setLanguageMode(previousNonFileLanguageMode, editor, {skipNotifications: true});

                                await setLanguageMode('file', editor, {skipNotifications: true});
                            } else {
                                window.setTimeout(function () {
                                    fnApplyTextAsCSS(editor);
                                }, 100);
                            }

                            // If language mode is file, then it might auto-connect for watching files as well
                            if (languageMode === 'file') {
                                // do nothing
                            } else {
                                var watchingCssFiles = await editor.userPreference('watching-css-files') === 'yes';
                                if (watchingCssFiles) {
                                    await socketOb._startWatchingFiles(editor);
                                }
                            }

                            var disableStyles = await editor.userPreference('disable-styles') === 'yes';
                            if (disableStyles) {
                                editor.indicateEnabledDisabled('disabled');
                            } else {
                                editor.indicateEnabledDisabled('enabled');
                            }

                            var applyStylesAutomatically = await editor.userPreference('apply-styles-automatically') === 'yes';
                            if (applyStylesAutomatically) {
                                editor.applyStylesAutomatically(true);
                            } else {
                                editor.applyStylesAutomatically(false);
                            }

                            // window.setTimeout(async function () {
                            //     await fnApplyTextAsCSS(editor, {
                            //         skipSavingFile: true    // Skip saving file since it is first launch
                            //     });
                            // }, 100);

                            // FIXME: Probably this piece of code is not used anymore
                            var autocompleteSelectors = await editor.userPreference(USER_PREFERENCE_AUTOCOMPLETE_SELECTORS);
                            if (autocompleteSelectors === 'no') {
                                $(editor.container).addClass('magicss-autocomplete-selectors-disabled');
                            } else {
                                $(editor.container).addClass('magicss-autocomplete-selectors-enabled');
                            }
                        },
                        reInitialized: async function (editor, cfg) {
                            await editor.disableEnableCSS('toggle');

                            cfg = cfg || {};
                            var duration = cfg.animDuration,
                                targetWidth = cfg.targetWidth,
                                targetHeight = cfg.targetHeight;
                            $('#' + id + ' .CodeMirror').animate(
                                {
                                    'width': targetWidth,
                                    'height': targetHeight
                                },
                                duration,
                                function () {
                                    setTimeout(async function () {
                                        await editor.saveDimensions({width: targetWidth, height: targetHeight});
                                        editor.bringCursorToView({pleaseIgnoreCursorActivity: true});
                                    });
                                }
                            );
                        },
                        beforehide: function (editor) {
                            if (editor.styleHighlightingSelector) {
                                editor.styleHighlightingSelector.cssText = '';
                                editor.styleHighlightingSelector.applyTag();
                            }
                        },
                        afterhide: function () {
                            // currently doing nothing
                        },
                        delayedcursormove: function (editor) {
                            var cssClass = processSplitText(editor.splitTextByCursor());
                            if (!cssClass) {
                                utils.alertNote.hide();
                            }

                            if (!editor.styleHighlightingSelector) {
                                editor.styleHighlightingSelector = new utils.StyleTag({
                                    id: 'magicss-highlight-by-selector',
                                    parentTag: 'body',
                                    attributes: [{
                                        name: 'data-style-created-by',
                                        value: 'magicss'
                                    }],
                                    overwriteExistingStyleTagWithSameId: true
                                });
                            }

                            if (cssClass) {
                                // Helps in highlighting SVG elements
                                editor.styleHighlightingSelector.cssText = cssClass + '{outline: 1px dashed red !important; fill: red !important; }';
                            } else {
                                editor.styleHighlightingSelector.cssText = '';
                            }
                            editor.styleHighlightingSelector.applyTag();
                        },
                        keyup: function () {
                            // Currently doing nothing
                        },
                        delayedtextchange: async function (editor) {
                            await fnApplyTextAsCSS(editor);
                        },
                        problematicFocusDetected: function (editor) {
                            // There is a chance that something is problematic in focus behavior
                            // Waiting for extra 1500ms for 2 reasons:
                            //     1. Confirming that the focus which was stolen hasn't been returned back
                            //     2. When the user clicks at another cursor position (or moves the cursor around),
                            //        we show the "alertNote" which mentions the current CSS selector (where user
                            //        has placed the cursor) and the number of DOM elements matching that CSS
                            //        selector. We also do "alertNote.hide()" if there is no CSS selector around.
                            //        This is currently done after a delay of 500ms from when the user took that
                            //        action. Waiting for 1500ms helps in letting the user see the "alertNote"
                            //        showing the number of matches and also in avoiding hiding of the "alertNote"
                            //        displayed by this function ("problematicFocusDetected")
                            setTimeout(function () {
                                // Confirming the focus problem
                                if (!editor.cmInputFieldHasFocus()) {
                                    // Informing the user about the focus problem
                                    informUserAboutProblematicFocus();
                                }
                            }, 1500);
                        },
                        clear: async function (editor) {
                            await fnApplyTextAsCSS(editor);
                        }
                    }
                };

                var fnReturnClass = function (splitText) {
                    var strBeforeCursor = splitText.strBeforeCursor,
                        strAfterCursor = splitText.strAfterCursor;

                    if (
                        (strBeforeCursor.substr(-1) === '/' && strAfterCursor.substr(0,1) === '*') ||
                        (strBeforeCursor.substr(-1) === '*' && strAfterCursor.substr(0,1) === '/')
                    ) {
                        return '';
                    }

                    var atSelector = true;
                    for (var i = strBeforeCursor.length; i >= 0; i--) {
                        if (
                            strBeforeCursor.charAt(i-1) === '{' ||
                            (strBeforeCursor.charAt(i-1) === '*' && strBeforeCursor.charAt(i-2) === '/')
                        ) {
                            atSelector = false;
                            break;
                        } else if (
                            strBeforeCursor.charAt(i-1) === ',' ||
                            strBeforeCursor.charAt(i-1) === '}' ||
                            strBeforeCursor.charAt(i-1) === '/'
                        ) {
                            atSelector = true;
                            break;
                        }
                    }

                    if (atSelector) {   // Positioned at a selector
                        // do nothing
                    } else {            // Not positioned at a selector
                        return '';
                    }

                    for (var j = 0; j <= strAfterCursor.length; j++) {
                        var charJ = strAfterCursor.charAt(j-1),
                            charJNext = strAfterCursor.charAt(j);
                        if (
                            charJ === ',' ||
                            charJ === '{' ||
                            charJ === '}' ||
                            (charJ === '*' && charJNext === '/') ||
                            (charJ === '/' && charJNext === '*')
                        ) {
                            break;
                        }
                    }

                    var cssClass = strBeforeCursor.substring(i) + strAfterCursor.substring(0, j - 1);
                    cssClass = jQuery.trim(cssClass);

                    if (cssClass) {
                        var count;

                        try {
                            count = $(cssClass).not('#MagiCSS-bookmarklet, #MagiCSS-bookmarklet *, #topCenterAlertNote, #topCenterAlertNote *').length;
                        } catch (e) {
                            return '';
                        }

                        var trunc = function (str, limit) {
                            if (str.length > limit) {
                                var separator = ' ... ';
                                str = str.substr(0, limit / 2) + separator + str.substr(separator.length + str.length - limit / 2);
                            }
                            return str;
                        };

                        if (count) {
                            utils.alertNote(trunc(cssClass, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(' + count + ' match' + ((count === 1) ? '':'es') + ')</span>', 2500);
                        } else {
                            utils.alertNote(trunc(cssClass, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(No matches)</span>', 2500);
                        }
                    }

                    return cssClass;
                };

                var processSplitText = function (splitText) {
                    if (getLanguageMode() === 'sass' || getLanguageMode() === 'less') {
                        if (!smc) {
                            return '';
                        }

                        var beforeCursor = splitText.strBeforeCursor,
                            rowNumber = (beforeCursor.match(/\n/g) || []).length,
                            columnNumber = beforeCursor.substr(beforeCursor.lastIndexOf('\n') + 1).length,
                            generatedPosition = smc.generatedPositionFor({
                                source: getLanguageMode() === 'less' ? 'input' : 'root/stdin',  // less('input') OR sass('root/stdin')
                                line: rowNumber + 1,  // Minimum value is 1 for line
                                column: columnNumber  // Minimum value is 0 for column
                            });

                        var cssCode = newStyleTag.cssText,
                            cssTextInLines = cssCode.split('\n'),
                            strFirstPart,
                            strLastPart;
                        if (generatedPosition.line) {
                            cssTextInLines = cssTextInLines.splice(0, generatedPosition.line);
                            var lastItem = cssTextInLines[cssTextInLines.length - 1];
                            cssTextInLines[cssTextInLines.length - 1] = lastItem.substr(0, generatedPosition.column);
                            strFirstPart = cssTextInLines.join('\n');
                            strLastPart = newStyleTag.cssText.substr(strFirstPart.length);
                            return fnReturnClass({
                                strBeforeCursor: strFirstPart,
                                strAfterCursor: strLastPart
                            });
                        } else {
                            return '';
                        }
                    } else {
                        return fnReturnClass(splitText);
                    }
                };

                class StylesEditor extends window.Editor {
                    indicateEnabledDisabled(enabledDisabled) {
                        if (enabledDisabled === 'enabled') {
                            $(this.container).removeClass('indicate-disabled').addClass('indicate-enabled');
                        } else {
                            $(this.container).removeClass('indicate-enabled').addClass('indicate-disabled');
                        }
                    }

                    applyStylesAutomatically(doApply) {
                        if (doApply) {
                            $(this.container).addClass('magic-css-apply-styles-automatically');
                        } else {
                            $(this.container).removeClass('magic-css-apply-styles-automatically');
                        }
                    }

                    markLiveCssServerConnectionStatus(connected) {
                        if (connected) {
                            $(this.container)
                                .removeClass('magic-css-live-css-server-is-not-connected')
                                .addClass('magic-css-live-css-server-is-connected');
                        } else {
                            $(this.container)
                                .removeClass('magic-css-live-css-server-is-connected')
                                .addClass('magic-css-live-css-server-is-not-connected');
                        }
                        this.adjustUiPosition();
                    }

                    isPointAndClickActivated() {
                        return enablePointAndClick;
                    }
                    deactivatePointAndClick() {
                        disablePointAndClickFunctionality(this);
                    }

                    async keyPressed(keyCombination) {
                        if (
                            keyCombination === 'Ctrl-P' ||
                            keyCombination === 'Cmd-P' ||
                            keyCombination === 'Ctrl-O' ||
                            keyCombination === 'Cmd-P'
                        ) {
                            await setLanguageMode('file', this);
                        }
                    }

                    async disableEnableCSS(doWhat) {
                        var disabled;
                        if (doWhat === 'disable') {
                            disabled = true;
                        } else if (doWhat === 'toggle') {
                            if (newStyleTag.disabled) {
                                disabled = false;
                            } else {
                                disabled = true;
                            }
                        } else {
                            disabled = false;
                        }
                        newStyleTag.disabled = disabled;
                        newStyleTag.applyTag();
                        await this.userPreference('disable-styles', disabled ? 'yes' : 'no');

                        if (disabled) {
                            this.indicateEnabledDisabled('disabled');
                            utils.alertNote('Deactivated the code', 5000);
                            return 'disabled';
                        } else {
                            this.indicateEnabledDisabled('enabled');
                            utils.alertNote('Activated the code', 5000);
                            return 'enabled';
                        }
                    }
                }

                utils.alertNote.hide();     // Hide the note which says that Magic CSS is loading
                window.MagiCSSEditor = new StylesEditor(options);
                await window.MagiCSSEditor.create();

                checkIfMagicCssLoadedFine(window.MagiCSSEditor);

                window.MagiCSSEditor.markLiveCssServerConnectionStatus(false);

                try {
                    chromeStorageForExtensionData.get('use-autocomplete-for-css-selectors', function (values) {
                        if (values && values['use-autocomplete-for-css-selectors'] === false) {
                            disableAutocompleteSelectors(window.MagiCSSEditor);
                        } else {
                            enableAutocompleteSelectors(window.MagiCSSEditor);
                        }
                    });
                } catch (e) {
                    enableAutocompleteSelectors(window.MagiCSSEditor);
                }

                if (executionCounter && !isNaN(executionCounter)) {
                    try {
                        chromeStorageForExtensionData.set({'magicss-execution-counter': executionCounter}, function() {
                            // do nothing
                        });
                    } catch (e) {
                        // do nothing
                    }
                }

                document.addEventListener('keyup', function (evt) {
                    if (evt.altKey && evt.shiftKey && evt.keyCode === 83) {
                        if (window.MagiCSSEditor.isVisible()) {
                            togglePointAndClick(window.MagiCSSEditor);
                        }
                    }
                }, false);

                if ((await (window.MagiCSSEditor.userPreference(USER_PREFERENCE_HIDE_ON_PAGE_MOUSEOUT))) === 'yes') {
                    var opacityCssAdded = false,
                        opacityStyleTagId = id + '-opacity-id';

                    var mousemoveListener = function () {
                        // This check is not necessary as such since we are removing the mousemoveListener
                        // once the code has been executed. This check is there just to prevent some possible
                        // bugs that might come up later if we change the approach/code and miss out some cases
                        if (opacityCssAdded) {
                            return;
                        }

                        utils.addStyleTag({
                            id: opacityStyleTagId,
                            attributes: [{
                                name: 'data-style-created-by',
                                value: 'magicss'
                            }],
                            cssText: [
                                'html #' + id + ' {',
                                '    transition: opacity 0.5s ease-in-out;',
                                '    opacity: 0 !important;',
                                '    pointer-events: none !important;',
                                '}',
                                'html:hover #' + id + ' {',
                                // Note that this opacity CSS would not let the editor hide in point-and-click mode (to generate CSS selector)
                                '    opacity: 1 !important;',
                                '    pointer-events: initial !important;',
                                '}'
                            ].join('\n'),
                            parentTag: 'body'
                        });
                        opacityCssAdded = true;
                        document.removeEventListener('mousemove', mousemoveListener, false);
                    };
                    document.addEventListener('mousemove', mousemoveListener, false);
                }
            }
        });
    };

    var executionCounter = 0;
    try {
        chromeStorageForExtensionData.get('magicss-execution-counter', function (values) {
            try {
                executionCounter = parseInt(values && values['magicss-execution-counter'], 10);
                executionCounter = isNaN(executionCounter) ? 0 : executionCounter;
                executionCounter = executionCounter < 0 ? 0 : executionCounter;
                executionCounter++;
            } catch (e) {
                // do nothing
            }
            setTimeout(async function () {
                await main();
            });
        });
    } catch (e) {
        setTimeout(async function () {
            await main();
        });
    }
}(jQuery));
