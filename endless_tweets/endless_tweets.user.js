// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @include        https://twitter.com/*
// ==/UserScript==

var _realWindow = typeof jQuery == "undefined" ? unsafeWindow : window

;(function(jQuery, twttr){
  
if (typeof GM_getValue == "function") {
  var getValue = GM_getValue
  var setValue = GM_setValue
} else {
  var Cookie = {
    PREFIX: '_greasekit_',
    prefixedName: function(name){
      return Cookie.PREFIX + name;
    },
    
    get: function(name) {
      var name = escape(Cookie.prefixedName(name)) + '='
      if (document.cookie.indexOf(name) >= 0) {
        var cookies = document.cookie.split(/\s*;\s*/)
        for (var i = 0; i < cookies.length; i++) {
          if (cookies[i].indexOf(name) == 0)
            return unescape(cookies[i].substring(name.length, cookies[i].length))
        }
      }
      return null
    },
    set: function(name, value, options) {
      newcookie = [escape(Cookie.prefixedName(name)) + "=" + escape(value)]
      if (options) {
        if (options.expires) newcookie.push("expires=" + options.expires.toGMTString())
        if (options.path)    newcookie.push("path=" + options.path)
        if (options.domain)  newcookie.push("domain=" + options.domain)
        if (options.secure)  newcookie.push("secure")
      }
      document.cookie = newcookie.join('; ')
    }
  }

  var getValue = function(name, defaultValue) {
    var value = Cookie.get(name)
    if (value) {
      if (value == 'true')  return true
      if (value == 'false') return false
      return value
    }
    else return defaultValue
  }
  var setValue = function(name, value) {
    var expiration = new Date()
    expiration.setFullYear(expiration.getFullYear() + 1)
    
    Cookie.set(name, value, { expires: expiration })
  }
}

var timeline = $('timeline'),
    currentUser = selectString('meta[@name="session-user-screen_name"]/@content'),
    currentPage = document.body.id,
    debugMode = getValue('debugMode', false),
    home = 'home' == currentPage,
    singleTweetPage = 'show' == currentPage,
    sourceString = 'endlesstweets',
    scriptVersion = '0.9.6',
    scriptLength = 37585

if (home) {
  var lastReadTweet = getValue('lastReadTweet', 0),
      oldLastRead = lastReadTweet
  
  $('source').value = sourceString
}

function livequeryRun() {
  jQuery.livequery && jQuery.livequery.run()
}

function getTwitterSession() {
  return (document.cookie.toString().match(/_twitter_sess=[^\s;]+/) || [])[0]
}

if (typeof GM_registerMenuCommand == "function") {
  GM_registerMenuCommand('Endless Tweets debug mode', function() {
    setValue('debugMode', (debugMode = !debugMode))
    alert('debug mode ' + (debugMode ? 'ON' : 'OFF'))
  })
}

if (timeline) {
  var nextPageLink = find('content', "#pagination a[@rel='next']"),
      enablePreloading = true,
      loading = false,
      preloadingHandler = null
  
  if (home) {
    var polling = getValue('polling', false),
        growls = window.fluid ? [] : null
    
    function updateTimestamps() {
      var now = new Date()
      
      forEach(select('.meta .published'), function(span) {
        var time, title = span.getAttribute('title')
        if (title) {
          time = new Date(title)
          span.innerHTML = Time.agoInWords(time, now) + ' ago'
        } else {
          time = Time.agoToDate(strip(span.textContent), now)
          span.setAttribute('title', time.toString())
        }
      })
    }
    
    function deliverUpdate(data) {
      var update = buildUpdateFromJSON(data)
      
    	// finally, insert the new tweet in the timeline ...
      insertTop(update, timeline)
      // ... and remove the oldest tweet from the timeline
      var oldestTweet = find(timeline, '> li[last()]')
      removeChild(oldestTweet)
      
      // never send Growl notifications for own tweets
      if (growls && data.user.screen_name != currentUser) {
        var title = data.user.screen_name + ' updated ' + strip(find(update, '.entry-date').textContent),
            description = data.text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        growls.push({
          title: title, description: description, icon: find(update, '.author img'),
          identifier: 'tw' + data.id, onclick: function() { window.fluid.activate() }
        })
      }
    }
    
    var debug = false // temp set to true for testing purposes
    
    var checkUpdates = function() {
      var url = '/statuses/friends_timeline.json'
      url += debug ? '?count=2' : '?since_id=' + lastReadTweet
      
      loadJSON(url, function(updates) {
        var data, count = 0
        for (var i = updates.length - 1; i >= 0; i--) {
          data = updates[i]
          // only show the update if an element with that status ID is not already present
          if (debug || !$('status_' + data.id)) {
            deliverUpdate(data)
            count++
          }
        }
        if (growls) {
          var limit = growls.length - 4
          for (var i = growls.length - 1; i >= 0; i--) {
            if (i < limit) {
              window.fluid.showGrowlNotification({
                title: '(' + limit + ' more update' + (limit > 1 ? 's' : '') + ')',
                description: '',
                onclick: function() { window.fluid.activate() }
              })
              break
            }
            window.fluid.showGrowlNotification(growls[i])
          }
          growls = []
        }
        if (count) {
          setValue('lastReadTweet', (lastReadTweet = data.id))
          livequeryRun()
        }
      })
      
      updateTimestamps()
    }
    
    var pollInterval = null
    
    var startPolling = function() {
      pollInterval = setInterval(checkUpdates, (debug ? 12 : 120) * 1000)
    }
    
    if (polling) startPolling()
    
    var control = $('device_control')
    if (control) {
      var label = $E('label')
      var pollToggle = $E('input', { type: 'checkbox' })
      pollToggle.checked = polling
      label.appendChild(pollToggle)
      label.appendChild(document.createTextNode(' update every 2 minutes'))
      control.appendChild($E('br'))
      control.appendChild(label)

      pollToggle.addEventListener('change', function(e) {
        if (pollToggle.checked) {
          if (!pollInterval) {
            checkUpdates()
            startPolling()
          }
        } else {
          if (pollInterval) clearInterval(pollInterval)
        }
        setValue('polling', (polling = pollToggle.checked))
      }, false)
    }
  }
      
  var someTweetLink = find(timeline, '> li[1] .status-body a')
  if (someTweetLink) {
    var pageDelimiterColor = getStyle(someTweetLink, 'color')
    var pageDelimiterStyle = '1px dotted ' + pageDelimiterColor
  } else {
    var pageDelimiterColor = '#aaa'
    var pageDelimiterStyle = '1px solid ' + pageDelimiterColor
  }
  
  function stopPreloading(text) {
    enablePreloading = false
    window.removeEventListener('scroll', preloadingHandler, false)
    var message = $E('p', { id: 'pagination-message' }, text)
    insertAfter(message, timeline)
  }

  function processTweet(item) {
    var id = Number(item.id.split('_')[1])
    
    if (home) {
      if (id > lastReadTweet) {
        // a tweet newer than the last read? mark it as new last read
        setValue('lastReadTweet', (lastReadTweet = id))
      } else if (id == oldLastRead) {
        stopPreloading("You have reached the last read tweet.")
        addClassName(item, 'last-read')
      } else if (id < oldLastRead && !enablePreloading) {
        addClassName(item, 'aready-read')
      }
    }
  }
  
  forEach(select('> li', timeline), processTweet)

  if (enablePreloading && nextPageLink) {
    log('attaching scroll handler')
    var nextURL = nextPageLink.href.replace(/\bpage=(\d+)/, 'page=@')
    var pageNumber = Number(RegExp.$1)
    
    function nearingBottom() {
      var viewportBottom = window.scrollY + window.innerHeight,
          nearNextPageLink = document.body.clientHeight - window.innerHeight/3
      return viewportBottom >= nearNextPageLink
    }
    
    window.addEventListener('scroll', preloadingHandler = function(e) {
      if (!loading && nearingBottom()) {
        loading = true
        log('nearing the end of page; loading page %s', pageNumber)
        
        // get the next page!
        loadJSON(nextPageLink.href, function(response) {
          var updates, list = $E('div'),
              hasNextPage = /<a [^>]*rel="next"/.test(response['#pagination'])
          
          list.innerHTML = response['#timeline']
          updates = xpath2array(select('.hentry', list))
          log("found %s updates", updates.length)
          match = null
          
          updates.forEach(function(update) {
            // don't insert tweets already present in the document
            if (!$(update.id)) {
              timeline.appendChild(update)
              processTweet(update)
            }
          })
          
          livequeryRun()
          updates, list = null

          if (hasNextPage) {
            // bump the page number on next page link
            nextPageLink.href = nextURL.replace('@', ++pageNumber)
            log("next page is now at %s", nextPageLink.href)
          } else {
            stopPreloading("This person has no more updates.")
            removeChild(nextPageLink)
          }

          loading = false
        }, { headers: { 'Cookie': getTwitterSession() } })
      }
    }, false)
  }
  
  addCSS("\
    #timeline .status-body .meta { white-space: nowrap }\
    #timeline .status.last-read { background: #ffffe8 }\
    #timeline .status.aready-read { color: #555 }\
    #timeline .status.aready-read a { color: #444 !important; }\
    #timeline .status.aready-read td.content strong a { text-decoration: none }\
    #timeline .status.aready-read td.thumb img { opacity: .6 }\
    #timeline .status.hentry_hover.last-read:hover { background: #ffc }\
    #pagination-message { font-style:italic; text-align:right; margin:1em 0 !important; }\
    #pagination-message + div.bottom_nav { margin-top: 0 !important; }\
    a.googlemap { display: block; margin-top: 4px; }\
    ")
} else if (singleTweetPage) {
  addCSS("\
    body#show .user-info { border-top-color: white }\
    body#show ol.statuses .status-body, body#show ol.statuses .screen-name { font-size: inherit; }\
    body#show ol.statuses .status-body { padding-bottom: 0; }\
    body#show #content ol.statuses .entry-content {\
      font-size: inherit; font-family: inherit; font-weight: normal;\
      background: transparent; display: inline; line-height: 1.2em;\
      }\
    body#show ol.statuses .actions a { padding: 3px 8px; }\
    body#show #content ol.statuses .meta { font-size: 0.8em; white-space: nowrap; }\
    #status_update_form #chars_left_notice { top: -4px !important; }\
    ")
  
  var actions = find('permalink', '.actions')
  if (actions) {
    actions.style.top = document.defaultView.getComputedStyle(actions, null).top
  }
  
  var replyLink = find('content', '.actions .repl')
  if (replyLink) {
    removeClassName(replyLink, 'repl')
    addClassName(replyLink, 'reply')
  } else {
    replyLink = find('content', '.actions .reply')
  }
  if (replyLink) {
    var replyHandler = function(e) {
      var container = $E('div')
      container.innerHTML = "<form method='post' id='status_update_form' class='status-update-form' action='http://twitter.com/status/update'>\
        <fieldset class='common-form standard-form'>\
          <div class='bar'>\
            <h3><label class='doing' for='status'>What are you doing?</label></h3>\
            <span class='numeric' id='chars_left_notice'>\
              <strong class='char-counter' id='status-field-char-counter'>140</strong>\
            </span>\
          </div>\
          <div class='info'>\
            <textarea name='status' id='status' rows='2' cols='40'></textarea>\
            <div class='status-btn'>\
              <input type='submit' class='status-btn round-btn disabled' id='update-submit' value='reply' name='update'/>\
            </div>\
          </div>\
        </fieldset>\
      </form>"
      
      var username = selectString('meta[@name="page-user-screen_name"]/@content'),
          replyForm = $('permalink').parentNode.appendChild(container.firstChild),
          label = find(replyForm, 'label.doing'),
          textInput = $('status'),
          counter = $('status-field-char-counter'),
          submitButton = $('update-submit'),
          submitDisabled = true,
          updateCounter = function(e) {
            counter.innerHTML = 140 - this.value.length
            if (e && submitDisabled) {
              removeClassName(submitButton, 'disabled')
              submitDisabled = false
            }
          }
          
      label.innerHTML = 'Reply to ' + username + ':'
      textInput.value = '@' + username + ' '
      textInput.focus()
      cursorEnd(textInput)
      updateCounter.call(textInput)
      textInput.addEventListener('keyup', updateCounter, false)
      
      replyForm.addEventListener('submit', function(e) {
        e.preventDefault()
        if (!submitDisabled) {
          addClassName(submitButton, 'disabled')
          submitDisabled = true
          // submit the reply to the server
          twttr.loading()
          loadJSON(replyForm.getAttribute('action'), function(response) {
            twttr.loaded()
            removeChild(replyForm)
            // twitter can return the full HTML for the status
            if (response.status_li) {
              var miniTimeline = $E('ol', { 'class': 'statuses' }, response.status_li)
            } else {
              var miniTimeline = buildUpdateFromJSON(response).parentNode
            }
            insertAfter(miniTimeline, $('permalink'))
            reveal(miniTimeline.firstChild)
          }, {
            method: replyForm.getAttribute('method'),
            data: {
              status: textInput.value,
              in_reply_to_status_id: window.location.toString().match(/\d+/)[0],
              return_rendered_status: true, twttr: true,
              authenticity_token: twttr.form_authenticity_token,
              source: sourceString
            },
            headers: { 'Cookie': getTwitterSession() }
          })
        }
      }, false)
      
      e.preventDefault()
      replyLink.removeEventListener('click', replyHandler, false)
    }
    replyLink.addEventListener('click', replyHandler, false)
  }
}

if ('profile' == currentPage) addCSS("\
  body#profile ol.statuses .thumb + span.status-body { margin-left: 55px; min-height: 50px; }\
  ")

var content = $('content')
if (content) {
  // catch click to "in reply to ..." links
  content.addEventListener('click', function(e) {
    var link = up(e.target, 'a', this)
    if (link && /^\s*in reply to /.test(link.textContent)) {
      var statusID = link.href.match(/(\d+)$/)[1]
      twttr.loading()
      loadJSON('/statuses/show/' + statusID + '.json', function(response) {
        onAvatarLoad(response, function() {
          var update = buildUpdateFromJSON(response),
              currentStatus = up(link, '.status', content)
              
          if (currentStatus) {
            // we're in a list of statuses
            insertAfter(update, currentStatus)
          } else {
            // we're on a fresh single tweet page
            insertAfter(update.parentNode, $('permalink'))
          }
          reveal(update)
          twttr.loaded()
          livequeryRun()
        })
      })
      e.preventDefault()
    }
  }, false)
  
  // catch TAB keypresses in the update form
  content.addEventListener('keydown', function(e) {
    var textarea = null
    if (e.keyCode == 9 && (textarea = up(e.target, 'textarea', this))) {
      var slice = function(start, end) {
        return textarea.value.slice(start, end)
      }
      var beforeText = slice(0, textarea.selectionStart),
          afterText = slice(textarea.selectionEnd, textarea.value.length),
          selected = slice(textarea.selectionStart, textarea.selectionEnd),
          completionSelection = /^(\w+) ?$/.test(selected),
          match = beforeText.match(/@(\w+)$/),
          trailingWhitespace = /\s/.test(slice(textarea.selectionEnd - 1, textarea.selectionEnd + 1)),
          cursorMode = !selected && (!afterText || trailingWhitespace),
          selectionMode = completionSelection && trailingWhitespace
      
      if (match && (cursorMode || selectionMode)) {
        var completion, found = [], partial = match[1]
        if (!selectionMode) detectTimelineMentions()
        
        friendNames.forEach(function(friend) {
          if (friend.indexOf(partial) === 0 && friend > partial) found.push(friend)
        })
        
        if (found.length == 0) return
        else e.preventDefault()
        
        if (selectionMode) {
          var nextIndex = found.indexOf(strip(partial + selected)) + 1
          completion = nextIndex == found.length ? found[0] : found[nextIndex]
        } else {
          completion = found[0]
        }
        
        var fill = completion.replace(partial, '') + ' '
        textarea.value = beforeText + fill + afterText.replace(/^ /, '')
        
        if (found.length > 1) positionCursor(textarea, beforeText.length, beforeText.length + fill.length)
        else if (afterText) positionCursor(textarea, -afterText.length)
      }
    }
  }, false)
}

function checkViewportWidth() {
  if (document.body.clientWidth < 780) addClassName(document.body, 'mini')
  else removeClassName(document.body, 'mini')
}
window.addEventListener('resize', checkViewportWidth, false)
checkViewportWidth()

addCSS("\
  body.mini #side_base {\
    -moz-border-radius: 0 !important; border-left: none !important; -webkit-border-radius: 0 !important;\
    display: block;\ position: absolute; left: 0; top: 0;\
    height: 40px; width: 423px; padding-left: 140px;\
  }\
  body.mini ul#tabMenu li { border: none; display: inline; width: auto; }\
  body.mini #tabMenu a { display: block !important; float: left; font-size: 10px !important; padding: 9px 4px !important; }\
  body.mini #side #tabMenu ~ *, body.mini #side #message_count, body.mini #side .about, body.mini #navigation, body.mini #footer { display: none }\
  body.mini #side { margin-bottom: 0; padding-top: 5px; width: auto !important; }\
  body.mini #side #profile #me_name, body.mini #side .promotion { display: none; }\
  body.mini #side div.section { padding: 0; }\
  body.mini #side div#profile.section { padding-bottom: 0; }\
  body.mini #side .stats { clear: none; float: left; margin: 5px 7px; }\
  body.mini #side .stats td:last-child, body.mini #side .stats a .label { display: none; }\
  body.mini #side .stats td + td { border-right: none; padding-right: 0; }\
  body.mini #side .user_icon { clear: none !important; float: left !important; width: 31px; position: static !important; }\
  body.mini #content { padding-top: 40px; -moz-border-radius: 0 !important; -webkit-border-radius: 0 !important; }\
  body.mini #container { width: 564px; padding: 0; margin: 0; }\
  body.mini #container > .columns { margin-bottom: 0; }\
  body.mini #container > .content-bubble-arrow { display: none; }\
  body.mini #header { margin: 0 !important; }\
  body.mini #header #logo { position: absolute; top: 0; left: 0; z-index: 1; }\
  body.mini #header #logo img { margin-top: 0; padding: 5px 8px; width:125px; height:29px; }\
  body.mini #loader { right: 5px; top: 5px; }\
  body#show.mini #container { width: 564px; }\
  body#show.mini #content { width: 534px; padding-top: 40px; }\
  ")

// *** JSON to HTML markup for a single update *** //

var buildUpdateFromJSON = (function() {
  var updateContainer
  
  function prepareContainer() {
    if (!updateContainer || updateContainer.parentNode)
      updateContainer = $E('ol', { 'class': 'statuses' })
    return updateContainer
  }
  
  return function(data) {
    var isReply = data.in_reply_to_screen_name,
      date = new Date(data.created_at),
      preparedData = {
        id: data.id,
        username: data.user.screen_name, avatar: data.user.profile_image_url, real_name: data.user.name,
        created_at: date.toString(), created_ago: Time.agoInWords(date) + ' ago',
        text: twitterLinkify(data.text), source: data.source,
        in_reply_to: data.in_reply_to_screen_name, in_reply_to_status: data.in_reply_to_status_id,
        fav_action: data.favorited ? 'un-favorite' : 'favorite',
        fav_class: data.favorited ? 'fav' : 'non-fav',
      }

    var updateHTML = ["<li id='status_#{id}' class='hentry status u-#{username}'>\
      <span class='thumb vcard author'><a class='url' href='/#{username}'>\
        <img width='48' height='48' src='#{avatar}' class='photo fn' alt='#{real_name}'/>\
      </a></span>\
      <span class='status-body'>"]
    if (data.user.protected) updateHTML.push("<img title='#{real_name}’s updates are protected— please don’t share!'\
      src='http://assets2.twitter.com/images/icon_lock.gif' class='lock' alt='Icon_lock'/> ")
    updateHTML.push("<strong><a class='screen-name' title='#{real_name}' href='/#{username}'>#{username}</a></strong>\
      <span class='entry-content'>#{text}</span>\
      <span class='meta entry-meta'>\
        <a rel='bookmark' class='entry-date' href='/#{username}/status/#{id}'>\
          <span title='#{created_at}' class='published'>#{created_ago}</span>\
        </a>\
        <span>from #{source}</span>")
    if (data.in_reply_to_status_id) updateHTML.push(
      " <a href='/#{in_reply_to}/status/#{in_reply_to_status}'>in reply to #{in_reply_to}</a>")
    updateHTML.push("</span>\
      </span>\
      <span class='actions'><div>\
        <a title='#{fav_action} this update' id='status_star_#{id}' class='fav-action #{fav_class}'>&nbsp;&nbsp;</a>")
    if (preparedData.username == currentUser) updateHTML.push("<a title='delete this update' class='del'>&nbsp;&nbsp;</a>")
    else updateHTML.push("<a title='reply to #{username}' class='reply'\
      href='/home?status=@#{username}%20&amp;in_reply_to_status_id=#{id}&amp;in_reply_to=#{username}'>&nbsp;&nbsp;</a>")
    updateHTML.push("</div></span></li>")
    
    prepareContainer()
    updateContainer.innerHTML = updateHTML.join('').replace(/#\{(\w+)\}/g, function(_, key) {
      return preparedData[key]
    })
    return updateContainer.firstChild
  }
})()

function onAvatarLoad(data, callback) {
  var avatar = new Image()
  avatar.addEventListener('load', callback, false)
  avatar.src = data.user.profile_image_url
}

// *** sorting of friends (sidebar) *** //

var friends = xpath2array(select('#side #following_list .vcard', null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE)),
    friendNames = []

function memoizeFriendName(name) {
  name = name.toLowerCase()
  if (friendNames.indexOf(name) < 0) friendNames.push(name)
}

function detectTimelineMentions() {
  if (timeline) {
    // pick up any author names on the current timeline
    forEach(select('.status-body > strong a/text()', timeline), function(name) {
      memoizeFriendName(name.nodeValue)
    })
    // detect any mentioned names
    forEach(select('.entry-content', timeline), function(body) {
      var matches = body.textContent.match(/@(\w+)/g)
      if (matches) matches.forEach(function(name) {
        memoizeFriendName(name.slice(1, name.length))
      })
    })
    friendNames = friendNames.sort()
  }
}

function compare(a, b, filter) {
  if (filter) {
    a = filter(a); b = filter(b);
  }
  if (a == b) return 0;
  return a < b ? -1 : 1;
}

if (friends.length) {
  friends.sort(function(a, b) {
    return compare(a, b, function(vcard) {
      if (!vcard._name) {
        vcard._name = selectString('./a/@href', vcard).match(/(\w+)\s*$/)[1]
        vcard._nameDowncase = vcard._name.toLowerCase()
      }
      return vcard._nameDowncase
    })
  })

  friends.forEach(function(vcard) {
    vcard.parentNode.appendChild(vcard)
    friendNames.push(vcard._nameDowncase)
  })
}

// *** iPhone location map *** //

var address = find(null, '#side .vcard .adr')

if (address && /[+-]?\d+\.\d+,[+-]?\d+\.\d+/.test(address.textContent)) {
  var API_KEY = 'ABQIAAAAfOaovFhDnVE3QsBZj_YthxSnhvsz13Tv4UkZBHR3eJwOymtuUxT045UEYNAo1HL_pePrMexH4SYngg',
      coordinates = RegExp['$&']
  // create static map that links to Google Maps
  address.innerHTML = '<a class="googlemap" href="http://maps.google.com/maps?q=' + coordinates + '"><img src="http://maps.google.com/staticmap?center=' + coordinates + '&markers=' + coordinates + ',red&zoom=13&size=165x165&key=' + API_KEY + '" alt=""></a>'
}

// *** update notification *** //

var checkUserscriptUpdate = (function(){
  if (typeof GM_xmlhttpRequest != "function") return (function() {}) // no-op
  
  var update = {
    get available() { return getValue('updateAvailable', false) },
    set available(value) { setValue('updateAvailable', value) },
    get scriptLength() { return getValue('scriptLength') },
    set scriptLength(value) { setValue('scriptLength', value) },
    get checkedAt() { return getValue('updateTimestamp') },
    set checkedAt(value) { setValue('updateTimestamp', value) },
    interval: 172800 // 2 days
  }
  
  // detect user has updated script
  if (update.scriptLength != scriptLength) {
    update.available = false
    update.scriptLength = scriptLength
  }
  
  function validateScriptLength(length, scriptLength) {
    update.available = scriptLength != length
  }
  
  return function(scriptURL, scriptLength, callback) {
    var sourceURL = scriptURL.replace(/show\/(\d+)$/, 'source/$1.user.js')

    if (!update.available) {
      var time = Math.floor(new Date().getTime() / 1000),
          performCheck = time > update.checkedAt + update.interval

      if (update.checkedAt && performCheck) {
        GM_xmlhttpRequest({
          url: sourceURL, method: 'HEAD',
          headers: { 'Accept-Encoding': '' }, // no gzip, k thx bai
          onload: function(r) {
            var match = r.responseHeaders.match(/Content-Length: (\d+)/)
            if (match) validateScriptLength(Number(match[1]), scriptLength)
            log('Performed check for userscript update (result: %s)', update.available)
          }
        })
      }
      if (!update.checkedAt || performCheck) update.checkedAt = time
    }

    if (update.available) callback()
  }
})()

var scriptURL = 'http://userscripts.org/scripts/show/24398',
    sidebar = $('side'),
    wrapper = find(null, '#content > .wrapper')
    
if (sidebar) {
  var section = $('feed') || find(sidebar, '.section')
  var scriptInfo = $E('div', { id: 'endless_tweets' }, 'powered by ')
  scriptInfo.appendChild($E('a', { 'href': scriptURL }, 'Endless Tweets'))
  scriptInfo.appendChild(document.createTextNode(' v' + scriptVersion))
  section.appendChild(scriptInfo)
  
  addCSS("\
    #endless_tweets { margin-top: .6em; font-size: 11px; font-variant: small-caps; }\
    #endless_tweets a { font-size: 12px; }\
    ")
}

if (wrapper) checkUserscriptUpdate(scriptURL, scriptLength, function() {
  var notice = $E('span', { id: 'userscript_update' },
    '“Endless Tweets” user script has updates (you have v' + scriptVersion + '). ')
  var install = $E('a', { 'href': scriptURL }, 'Get the upgrade')
  notice.appendChild(install)
  
  var topAlert = find('content', '.bulletin.info')
  if (!topAlert && home) topAlert = insertTop($E('div', { 'class': 'bulletin info' }), find(wrapper, '.section'))
  if (topAlert) topAlert.appendChild(notice)
  else insertTop(notice, wrapper)
  
  addCSS("\
    #userscript_update { display: block }\
    .wrapper > #userscript_update { text-align: right; color: gray; padding: 0; font-size: 90% }\
    .bulletin.info #userscript_update { text-align: inherit }\
    body#show #userscript_update { margin: -.6em 0 .6em 0; }\
    ")
})

// ********* UTILITY FUNCTIONS ********* //
  
function $(id){
  return typeof id == 'string' ? document.getElementById(id) : id
}

function down(node) {
  var child = node.firstChild
  while(child && child.nodeType != Node.ELEMENT_NODE) child = child.nextSibling
  return child
}

function up(node, selector, stopNode) {
  for (; node && (!stopNode || node != stopNode); node = node.parentNode)
    if (matchesCss(node, selector)) return node
}

function matchesCss(node, selector) {
  var firstChar = selector.charAt(0)
  
  if (firstChar == '.') {
    return hasClassName(node, selector.slice(1, selector.length))
  } else if (firstChar == '#') {
    return node.id == selector.slice(1, selector.length)
  } else {
    return node.nodeName.toLowerCase() == selector
  }
}

function hasClassName(element, className) {
  var elementClassName = element.className
  return (elementClassName.length > 0 && (elementClassName == className || 
    new RegExp("(^|\\s)" + className + "(\\s|$)").test(elementClassName)))
}

function addClassName(element, className) {
  if (!hasClassName(element, className))
    element.className += (element.className ? ' ' : '') + className
  return element
}

function removeClassName(element, className) {
  element.className = element.className.replace(
    new RegExp("(^|\\s+)" + className + "(\\s+|$)"), ' ')
  return element
}

function removeChild(element) {
  return element.parentNode.removeChild(element)
}

function insertAfter(element, node) {
  return node.parentNode.insertBefore(element, node.nextSibling)
}

function insertTop(element, node) {
  return node.insertBefore(element, node.firstChild)
}

function $E(name, attributes, content) {
  if (typeof attributes == 'string') {
    content = attributes
    attributes = null
  }
  var node = document.createElement(name)
  if (attributes) for (var attr in attributes) node.setAttribute(attr, attributes[attr])
  if (content) node.innerHTML = content
  return node
}

function forEach(object, block, context) {
  var xpath = typeof object.snapshotItem == "function"
  for (var i = 0, length = xpath ? object.snapshotLength : object.length; i < length; i++)
    block.call(context, xpath ? object.snapshotItem(i) : object[i], i, object)
}

function xpath2array(result) {
  var item, arr = []
  for (var i = 0, length = result.snapshotLength; i < length; i++)
    arr.push(result.snapshotItem(i))
  return arr
}

function select(xpath, parent, type) {
  if (!/^\.?\/./.test(xpath)) xpath = css2xpath(xpath)
  return document.evaluate(xpath, parent || document, null, type || XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
}
function selectString(xpath, parent) {
  var result = select(xpath, parent, XPathResult.STRING_TYPE)
  return result && result.stringValue
}

function find(parent, xpath, index) {
  parent = $(parent)
  if (index == undefined)
    return select(xpath, parent, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue
  else
    return select(xpath, parent).snapshotItem(index)
}

function xpathClass(name) {
  return "[contains(concat(' ', @class, ' '), ' " + name + " ')]"
}

// only handles child selectors, classnames and IDs
function css2xpath(css) {
  var fragments = css.split(/\s+/), xpath = ['.'], child = false

  xpath.add = function(part) {
    xpath.push(child ? '/' : '//')
    child = false
    xpath.push(part || '*')
  }
  
  fragments.forEach(function(fragment) {
    if (!fragment) return;
    if (fragment == '>') child = true;
    else if (/^([^.]*)\.([\w.-]+)/.test(fragment)) {
      xpath.add(RegExp.$1)
      RegExp.$2.split('.').forEach(function(className) {
        xpath.push(xpathClass(className))
      })
      if (RegExp["$'"]) xpath.push(RegExp["$'"])
    }
    else if (/^([^.]*)#([\w-]+)/.test(fragment)) {
      xpath.add(RegExp.$1)
      xpath.push('[@id="' + RegExp.$2 + '"]')
      if (RegExp["$'"]) xpath.push(RegExp["$'"])
    }
    else xpath.add(fragment)
  })
  return xpath.join('')
}

function getStyle(element, style) {
  element = $(element)
  if (style == 'float') style = 'cssFloat'
  var value = element.style[style]
  if (!value) {
    var css = document.defaultView.getComputedStyle(element, null)
    value = css ? css[style] : null
  }
  if (style == 'opacity') return value ? parseFloat(value) : 1.0
  return value == 'auto' ? null : value
}

var styleElement = null

function addCSS(css) {
  if (typeof GM_addStyle == "function") GM_addStyle(css)
  else {
    if (!styleElement) {
      var head = document.getElementsByTagName('head')[0]
      var styleElement = $E('style', { type: 'text/css' })
      head.appendChild(styleElement)
    }
    styleElement.appendChild(document.createTextNode(css))
  }
}

function log(message) {
  if (debugMode) {
    for (var i = 1; i < arguments.length; i++)
      message = message.replace('%s', arguments[i])
      
    if (typeof GM_log == "function") GM_log(message)
    else if (window.console) console.log(message)
  }
}

if (typeof GM_xmlhttpRequest == "function") {
  var xhr = GM_xmlhttpRequest
} else {
  var xhr = function(params) {
    var request = new XMLHttpRequest()
    
    request.onreadystatechange = function() {
      if (params.onreadystatechange) params.onreadystatechange(request)
      if (request.readyState == 4) {
        if (request.status >= 200 && request.status < 400) if (params.onload) params.onload(request)
        else if (params.onerror) params.onerror(request)
      }
    }
    
    request.open(params.method, params.url, true)
    if (params.headers) for (name in params.headers)
      request.setRequestHeader(name, params.headers[name])
    
    request.send(params.data)
    return request
  }
}

function ajax(params) {
  var defaults = {
    method: 'GET',
    onerror: function(response) { log('ERROR ' + response.status) }
  }
  var defaultHeaders = {
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, text/html, */*'
  }
      
  params = extend(defaults, params)
  params.headers = extend(defaultHeaders, params.headers || {})
  
  if (!/^https?[:]/.test(params.url)) {
    params.url = window.location.protocol + '//' + window.location.host + params.url
  }
  
  if (typeof params.data == 'object') {
    params.data = objectToQueryString(params.data)
    params.headers['Content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  }
  
  return xhr(params)
}

function loadJSON(url, onload, params) {
  params = extend({ url: url, onload: onload }, params || {})
  var handler = params.onload
  
  params.onload = function(response) {
    if (typeof response.getResponseHeader == 'function') {
      // native XMLHttpRequest interface
      var responseType = (response.getResponseHeader('Content-type') || '').split(';')[0]
    } else {
      // GM_xmlhttpRequest interface
      var responseType = (response.responseHeaders.match(/^Content-[Tt]ype:\s*([^\s;]+)/m) || [])[1]
    }
    if (responseType == 'application/json' || responseType == 'text/javascript') {
      var object = eval("(" + response.responseText + ")")
      if (object) handler(object, response)
    }
  }
  return ajax(params)
}

var Time = (function() {
  var sec = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 }
  
  return {
    agoInWords: function(time, relativeTo) {
      if (!relativeTo) relativeTo = new Date()
      var delta = (relativeTo - time) / 1000
      if (delta < 5) return 'less than 5 seconds'
      else if (delta < 10)  return 'less than 10 seconds'
      else if (delta < 20)  return 'less than 20 seconds'
      else if (delta < sec.m)  return 'less than a minute'
      else if (delta < sec.m * 2) return 'about a minute'
      else if (delta < sec.h)    return Math.round(delta / 60) + ' minutes'
      else if (delta < sec.h * 2)   return 'about an hour'
      else if (delta < sec.d) return 'about ' + Math.round(delta / 3600) + ' hours'
      else if (delta < sec.d * 2) return '1 day'
      else return Math.round(delta / sec.d) + ' days'
    },
    agoToDate: function(string, relativeTo) {
      if (!relativeTo) relativeTo = new Date()
      var match = string.match(/(?:(?:about|less than) )?(a|an|\d+) ([smhd])/)
      if (match) {
        var amount = Number(match[1]) || 1, metric = match[2]
        return new Date(relativeTo - sec[metric] * amount * 1000)
      }
    }
  }
})()

function strip(string) {
  return string.replace(/^\s+/, '').replace(/\s+$/, '')
}

function objectToQueryString(hash) {
  var pairs = []
  for (key in hash) {
    var value = hash[key]
    if (typeof value != 'undefined') pairs.push(encodeURIComponent(key) + '=' +
      encodeURIComponent(value == null ? '' : String(value)))
  }
  return pairs.join('&')
}

function countOccurences(string, pattern) {
  return string.split(pattern).length - 1
}

var bracketMap = { ']': '[', ')': '(', '}': '{' }

function linkify(text) {
  return text.replace(/\b(https?:\/\/|www\.)[^\s]+/g, function(href) {
    // check for punctuation character at the end
    var punct = '', match = href.match(/[.,;:!?\[\](){}"']$/)
    if (match) {
      var punct = match[0], opening = bracketMap[punct]
      // ignore closing bracket if it should be part of the URL (think Wikipedia links)
      if (opening && countOccurences(href, opening) == countOccurences(href, punct)) punct = ''
      // in other cases, last punctuation character should not be a part of the URL
      else href = href.slice(0, -1)
    }
    
    var fullHref = (href.indexOf('http') == 0) ? href : 'http://' + href
    return '<a href="' + fullHref + '">' + href + '</a>' + punct
  })
}

function twitterLinkify(text) {
  return linkify(text).replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
}

function extend(destination, source) {
  for (var property in source) destination[property] = source[property]
  return destination
}

function cursorEnd(field) {
  positionCursor(field, field.value.length)
}

function positionCursor(field, start, end) {
  if (start < 0) start = field.value.length + start
  if (!end) end = start
  field.selectionStart = start
  field.selectionEnd = end
}

function reveal(element) {
  jQuery(element).hide().slideDown()
}

// get a reference to the jQuery object, even if it requires
// breaking out of the GreaseMonkey sandbox in Firefox
// (we need to trust Twitter.com)
})(_realWindow.jQuery, _realWindow.twttr)
