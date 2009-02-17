// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @include        https://twitter.com/*
// ==/UserScript==

(function(jQuery){
  
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

var timeline  = $('timeline'),
    home      = window.location.pathname == '/home',
    debugMode = getValue('debugMode', false),
    singleTweetPage = !home && 'show' == document.body.id

if (home) {
  var lastReadTweet = getValue('lastReadTweet', 0)
  var oldLastRead   = lastReadTweet
}

if (typeof GM_registerMenuCommand == "function") {
  GM_registerMenuCommand('Endless Tweets debug mode', function() {
    setValue('debugMode', (debugMode = !debugMode))
    alert('debug mode ' + (debugMode ? 'ON' : 'OFF'))
  })
}

if (timeline && !singleTweetPage) {
  var nextPageLink = find('content', "div.pagination a[@rel='prev']"),
      enablePreloading = true,
      loading = false,
      preloadingHandler = null
  
  if (home) {
    var updateContainer = $E('ol'),
        polling = getValue('polling', false),
        currentUser = strip($('me_name').textContent),
        growls = window.fluid ? [] : null
    
    function countOccurences(string, pattern) {
      return string.split(pattern).length - 1
    }
    
    var brackets = { ']': '[', ')': '(', '}': '{' }
    
    function linkify(text) {
      var linked = text.replace(/\b(https?:\/\/|www\.)[^\s]+/g, function(href) {
        // check for punctuation character at the end
        var punct = '', match = href.match(/[^\w\/-]$/)
        if (match) {
          var punct = match[0], opening = brackets[punct]
          // ignore closing bracket if it should be part of the URL (think Wikipedia links)
          if (opening && countOccurences(href, opening) == countOccurences(href, punct)) punct = ''
          // in other cases, last punctuation character should not be a part of the URL
          else href = href.slice(0, -1)
        }
        
        var fullHref = (href.indexOf('http') == 0) ? href : 'http://' + href
        return '<a href="' + fullHref + '">' + href + '</a>' + punct
      })
      return linked.replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
    }
    
    function deliverUpdate(data) {
      var isReply = data.in_reply_to_screen_name,
        date = new Date(data.created_at),
        username = data.user.screen_name,
        ownUpdate = username == currentUser,
        preparedData = {
          id: data.id, reply_class: isReply ? 'reply' : '',
          username: username, avatar: data.user.profile_image_url, real_name: data.user.name,
          created_at: date.toString(), created_ago: relativeTime(date) + ' ago',
          text: linkify(data.text), source: data.source,
          in_reply_to: data.in_reply_to_screen_name, in_reply_to_status: data.in_reply_to_status_id,
          fav_action: data.favorited ? 'un-favorite' : 'favorite',
          fav_class: data.favorited ? 'fav' : 'non-fav',
        }
          
      // HTML markup for a single tweet
      var updateHTML = ["<li id='status_#{id}' class='hentry status #{reply_class} u-#{username}'>\
        <span class='thumb vcard author'><a class='url' href='/#{username}'>\
          <img width='48' height='48' src='#{avatar}' class='photo fn' alt='#{real_name}'/>\
        </a></span>\
        <span class='status-body'>"]
      if (data.user.protected) updateHTML.push("<img title='#{real_name}’s updates are protected— please don’t share!'\
        src='http://assets2.twitter.com/images/icon_lock.gif' class='lock' alt='Icon_lock'/> ")
      updateHTML.push("<strong><a title='#{real_name}' href='/#{username}'>#{username}</a></strong>\
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
      if (ownUpdate) updateHTML.push("<a title='delete this update' class='del'>&nbsp;&nbsp;</a>")
      else updateHTML.push("<a title='reply to #{username}' class='repl'\
        href='/home?status=@#{username}%20&amp;in_reply_to_status_id=#{id}&amp;in_reply_to=#{username}'>&nbsp;&nbsp;</a>")
      updateHTML.push("</div></span></li>")
      
      updateContainer.innerHTML = updateHTML.join('').replace(/#\{(\w+)\}/g, function(_, key) {
        return preparedData[key]
      })
      
    	// finally, insert the new tweet in the timeline ...
      timeline.insertBefore(updateContainer.firstChild, timeline.firstChild)
      // ... and remove the oldest tweet from the timeline
      var oldestTweet = find(timeline, '> li[last()]')
      timeline.removeChild(oldestTweet)
      
      // never send Growl notifications for own tweets
      if (growls && !ownUpdate) {
        var title = username + ' updated ' + preparedData.created_ago,
            description = data.text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        growls.push({
          title: title, description: description, // icon: thumbImg,
          identifier: 'tw' + data.id, onclick: function() { window.fluid.activate() }
        })
      }
    }
    
    var debug = false // temp set to true for testing purposes
    
    var checkUpdates = function() {
      if (debug)
        var url = 'http://twitter.com/statuses/friends_timeline.json?count=5'
      else
        var url = 'http://twitter.com/statuses/friends_timeline.json?since_id=' + lastReadTweet
      
      xhr({
        url: url,
        method: 'get',
        onerror: function(req) { log('ERROR ' + req.status) },
        onload: function(req) {
          var data, updates = eval(req.responseText), count = 0
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
            jQuery.livequery.run()
          }
        }
      })
    }
    
    var pollInterval = null
    
    var startPolling = function() {
      pollInterval = setInterval(checkUpdates, (debug ? 12 : 120) * 1000)
    }
    
    if (polling) startPolling()
    
    var control = $('device_control')
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
    timeline.parentNode.insertBefore(message, timeline.nextSibling)
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
    var nextURL = nextPageLink.href.replace(/(\d+)$/, '')
    var pageNumber = Number(RegExp.$1)
    
    window.addEventListener('scroll', preloadingHandler = function(e) {
      if (!loading && this.scrollY + this.innerHeight >= nextPageLink.offsetTop - this.innerHeight/3) {
        loading = true
        log('nearing the end of page; loading page %s', pageNumber)
        
        // get the next page!
        xhr({
          method: 'GET',
          url: nextPageLink.href,
          headers: { Accept: 'application/json' },
          onload: function(r) {
            var json = eval("(" + r.responseText + ")")
            if (!json) return
            
            var update, updates, list = $E('div'),
                hasNextPage = /<a [^>]*rel="prev"/.test(json['#pagination'])
            
            list.innerHTML = json['#timeline']
            updates = xpath2array(select('.hentry', list))
            log("found %s updates", updates.length)
            match = null
            
            updates.forEach(function(update) {
              // don't show tweets already present in the document
              if (!$(update.id)) {
                timeline.appendChild(update)
                processTweet(update)
              }
            })
            
            jQuery.livequery.run()
            update, updates, list = null

            if (hasNextPage) {
              // bump the page number on next page link
              nextPageLink.href = nextURL + (++pageNumber)
              log("next page is now at %s", nextPageLink.href)
            } else {
              stopPreloading("This person has no more updates.")
              nextPageLink.parentNode.removeChild(nextPageLink)
            }

            loading = false
          }
        })
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
    body#show .user-info { border-top: none }\
    #doingForm { max-width: 537px; }\
    #doingForm #chars_left_notice { top: -4px !important; }\
    ")
  
  var replyLink = find($('content'), '.actions .repl')
  if (replyLink) {
    var replyHandler = function(e) {
      var container = $E('div')
      container.innerHTML = "<form method='post' id='doingForm' action='http://twitter.com/status/update'>\
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
              <input type='submit' class='status-btn round-btn disabled' id='update-submit' value='update' name='update'/>\
            </div>\
          </div>\
        </fieldset>\
      </form>"
      
      var username = selectString('meta[@name="page-user-screen_name"]/@content'),
          replyForm = $('permalink').parentNode.appendChild(container.firstChild),
          label = find(replyForm, 'label.doing'),
          textInput = $('status'),
          counter = $('status-field-char-counter'),
          updateCounter = function(e) { counter.innerHTML = 140 - this.value.length }
          
      label.innerHTML = 'Reply to ' + username + ':'
      textInput.value = '@' + username + ' '
      textInput.focus()
      textInput.selectionStart = textInput.selectionEnd = textInput.value.length
      updateCounter.call(textInput)
      textInput.addEventListener('keyup', updateCounter, false)
      
      e.preventDefault()
      replyLink.removeEventListener('click', replyHandler, false)
    }
    replyLink.addEventListener('click', replyHandler, false)
  }
}

// *** sorting of friends (sidebar) *** //

var friends = xpath2array(select('#side #following_list .vcard', null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE))

function compare(a, b, filter) {
  if (filter) {
    a = filter(a); b = filter(b);
  }
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a == b) return 0;
  return a < b ? -1 : 1;
}

if (friends.length) {
  friends.sort(function(a, b) {
    return compare(a, b, function(vcard) {
      return selectString('./a/@href', vcard).replace(/^\s+|\s+$/g, '').split('/')[3]
    })
  })

  friends.forEach(function(vcard) {
    vcard.parentNode.appendChild(vcard)
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

var wrapper = find(null, '#content > .wrapper')

if (wrapper && typeof GM_xmlhttpRequest == "function") {
  var scriptURL = 'http://userscripts.org/scripts/show/24398',
      sourceURL = scriptURL.replace(/show\/(\d+)$/, 'source/$1.user.js'),
      scriptLength = 22706,
      updateAvailable = getValue('updateAvailable', false)

  function validateScriptLength(length) {
    if (updateAvailable = scriptLength != length)
      setValue('updateAvailable', length)
    else
      setValue('updateAvailable', updateAvailable)
  }

  if (typeof updateAvailable == 'number') validateScriptLength(updateAvailable)

  if (!updateAvailable) {
    var lastUpdate = getValue('updateTimestamp'),
        time = Math.floor(new Date().getTime() / 1000),
        performCheck = time > lastUpdate + 172800 // 2 days
        
    if (lastUpdate && performCheck) {
      GM_xmlhttpRequest({
        method: 'HEAD',
        url: sourceURL,
        headers: { 'Accept-Encoding': '' }, // no gzip, k thx bai
        onload: function(r) {
          var m = r.responseHeaders.match(/Content-Length: (\d+)/)
          validateScriptLength(Number(m[1]))
        }
      })
      log('Performed check for script updates')
    }
    
    if (!lastUpdate || performCheck)
      setValue('updateTimestamp', time)
  }

  if (updateAvailable) {
    var notice = $E('div', { id: 'userscript_update' }, '“Endless Tweets” user script has updates. ');
    var install = $E('a', { 'href': scriptURL }, 'Get the upgrade');
    notice.appendChild(install);
    wrapper.insertBefore(notice, wrapper.firstChild)
    
    addCSS("\
      #userscript_update { text-align: right; color: gray; }\
      body#show #userscript_update { margin: -.6em 0 .6em 0; }\
      #userscript_update a { text-decoration: underline }\
      ")
  }
}

// ********* UTILITY FUNCTIONS ********* //
  
function $(id){
  return typeof id == 'string' ? document.getElementById(id) : id
}

function down(node) {
  var child = node.firstChild
  while(child && child.nodeType != Node.ELEMENT_NODE) child = child.nextSibling
  return child
}

function up(node, selector) {
  do {
    node = node.parentNode
  } while (node && !matchesCss(node, selector))
  return node
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
    else if (/^([^.]*)\.([\w.-]+)$/.test(fragment)) {
      xpath.add(RegExp.$1)
      RegExp.$2.split('.').forEach(function(className) {
        xpath.push(xpathClass(className))
      })
    }
    else if (/^([^.]*)#([\w-]+)$/.test(fragment)) {
      xpath.add(RegExp.$1)
      xpath.push('[@id="' + RegExp.$2 + '"]')
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
    var req = new XMLHttpRequest()
    
    req.onreadystatechange = function() {
      if (req.readyState == 4) {
        if (req.status >= 200 && req.status < 400) if (params.onload) params.onload(req)
        else if (params.onerror) params.onerror(req)
      }
    }
    
    req.open(params.method, params.url, true)
    if (params.headers) for (name in params.headers)
      req.setRequestHeader(name, params.headers[name])
    
    req.send(params.data)
  }
}

// stolen from twitter.com (hope you guys don't mind)
function relativeTime(date, relativeTo) {
  if (!relativeTo) relativeTo = new Date
  var delta = (relativeTo.getTime() - date.getTime()) / 1000
  if (delta < 5) return 'less than 5 seconds'
  else if (delta < 10)  return 'less than 10 seconds'
  else if (delta < 20)  return 'less than 20 seconds'
  else if (delta < 60)  return 'less than a minute'
  else if (delta < 120) return 'about a minute'
  else if (delta < (60*60))    return Math.round(delta / 60) + ' minutes'
  else if (delta < (120*60))   return 'about an hour'
  else if (delta < (24*60*60)) return 'about ' + Math.round(delta / 3600) + ' hours'
  else if (delta < (48*60*60)) return '1 day'
  else return Math.round(delta / 86400) + ' days'
}

function strip(string) {
  return string.replace(/^\s+/, '').replace(/\s+$/, '')
}

// get a reference to the jQuery object, even if it requires
// breaking out of the GreaseMonkey sandbox in Firefox
// (we need to trust Twitter.com)
})(typeof jQuery == "undefined" ? unsafeWindow.jQuery : jQuery)
