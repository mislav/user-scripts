// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @exclude        http://twitter.com/help
// @exclude        http://twitter.com/help/*
// ==/UserScript==

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
    debugMode = getValue('debugMode', false)
    
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

if (timeline) {
  var nextPageLink = find('content', "div.pagination a[@rel='prev']"),
      timelineBody = $('timeline_body'),
      enablePreloading = true,
      loading = false,
      preloadingHandler = null
  
  if (home) {
    var cloneSource, polling = getValue('polling', false),
        currentUser = $('me_name').textContent
    
    function cloneExistingTweet() {
      if (!cloneSource || !cloneSource.parentNode) {
        var replyLink = find(timelineBody, '.actions a.repl')
        cloneSource = up(replyLink, 'tr')
      }
      return cloneSource.cloneNode(true)
    }
    
    function linkify(text) {
      return text.
        replace(/\b(https?:\/\/\S+?)([.,:;!?]?(?:\s|$))/g, '<a href="$1">$1</a>$2').
        replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
    }
    
    function deliverUpdate(data) {
      var user = data.user
      var isCurrentUser = user.screen_name == currentUser
      // deep-clone an existing tweet and only change its contents
      var update = cloneExistingTweet()
      updateStatusInAttribute(update, 'id', data.id)
      update.className = 'hentry status'
      // user's thumbnail
      var thumb = find(update, '.thumb > a')
      var thumbImg = down(thumb)
      thumbImg.alt = user.name
      thumbImg.src = user.profile_image_url
      updateStatusInAttribute(thumb, 'href', user.screen_name)
      // main stuff: author and text
      var body = find(update, '.status-body')
      var name = find(body, 'strong a')
      name.href = thumb.href
      name.title = user.name
      name.firstChild.nodeValue = user.screen_name
      var text = find(body, '.entry-content')
      text.innerHTML = linkify(data.text)
      // metadata
      var meta = find(body, '.entry-meta')
      var date = new Date(data.created_at)
      meta.innerHTML = '<a href="http://twitter.com/' + user.screen_name + '/statuses/' + data.id +
        '" class="entry-date" rel="bookmark"><span class="published" title="">' +
        date.getHours() + ':' + date.getMinutes() + '</span></a> from ' + data.source
      
      // 'reply' icon
      var replyLink = find(update, '.actions a.repl')
      
      if (isCurrentUser) {
        replyLink.parentNode.removeChild(replyLink)
      } else {
        updateStatusInAttribute(replyLink, 'title', user.screen_name)
        replyLink.href = '/home?status=@' + user.screen_name + '&in_reply_to_status_id=' + data.id
      }
      
    	// finally, insert the new tweet in the timeline ...
      timelineBody.insertBefore(update, timelineBody.rows[0])
      // ... and remove the oldest tweet from the timeline
      var oldestTweet = timeline.rows[timeline.rows.length - 1]
      oldestTweet.parentNode.removeChild(oldestTweet)
      
      // never send Growl notifications for own tweets
      if (window.fluid && !isCurrentUser) {
        var title = user.screen_name + ' updated ' + relativeTime(date) + ' ago'
        window.fluid.showGrowlNotification({
          title: title, description: data.text, icon: thumbImg,
          identifier: data.id, onclick: function() { window.fluid.activate() }
        })
      }
    }
    
    function updateStatusInAttribute(obj, prop, id) {
      var replacement, initial = obj.getAttribute(prop)
      if (typeof id == 'number') replacement = initial.replace(/([_\/])(\d{8,})\b/, '$1' + id)
      else replacement = initial.replace(/[\w-]+$/, id)
      obj.setAttribute(prop, replacement)
    }
    
    var checkUpdates = function() {
      xhr({
        url: 'http://twitter.com/statuses/friends_timeline.json?since_id=' + lastReadTweet,
        // url: 'http://twitter.com/statuses/friends_timeline.json?count=2',
        method: 'get',
        onerror: function(req) { alert('ERROR ' + req.status) },
        onload: function(req) {
          var data, updates = eval(req.responseText)
          for (var i = updates.length - 1; i >= 0; i--) {
            data = updates[i]
            // only show the update if an element with that status ID is not already present
            if (!$('status_' + data.id)) deliverUpdate(data)            
          }
          if (data) setValue('lastReadTweet', (lastReadTweet = data.id))
        }
      })
    }
    
    var pollInterval = null
    
    var startPolling = function() {
      pollInterval = setInterval(checkUpdates, 120 * 1000)
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
      
  var someTweetLink = find(timelineBody, '> tr[1] div.status-body a')
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

  function processTweet(row) {
    var id = Number(row.id.split('_')[1])
    
    if (home) {
      if (id > lastReadTweet) {
        // a tweet newer than the last read? mark it as new last read
        setValue('lastReadTweet', (lastReadTweet = id))
      } else if (id == oldLastRead) {
        stopPreloading("You have reached the last read tweet.")
        row.className += ' last-read'
      } else if (id < oldLastRead && !enablePreloading) {
        row.className += ' aready-read'
      }
    }
  }
  
  forEach(timelineBody.rows, processTweet)

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
          onload: function(r) {
            var row, rows = [],
                match = r.responseText.match(/<table[^>]*id="timeline"[^>]*>([\s\S]+?)<\/table>/),
                hasNextPage = /<a [^>]*rel="prev"/.test(r.responseText),
                table = $E('table')
            
            table.innerHTML = match[1]
            log("found %s rows", table.rows.length)
            match = null
            var newTimelineBody = table.tBodies[1]
            newTimelineBody.id = ""
            forEach(newTimelineBody.rows, function(row) { rows.push(row) })
            // don't show tweets already present in the document
            rows.forEach(function(row) { if ($(row.id)) newTimelineBody.removeChild(row) })
            log("%s rows to insert", newTimelineBody.rows.length)
            
            timeline.appendChild(newTimelineBody)
            forEach(newTimelineBody.rows, processTweet)
            log("page %s processed", pageNumber)
            newTimelineBody = table = null

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
    #timeline { border-collapse: collapse }\
    #timeline td.content span.meta { white-space: nowrap }\
    #timeline td[align='right'] { padding-top:2px; padding-bottom:2px; }\
    #timeline tbody { border-top: " + pageDelimiterStyle + " }\
    #timeline #timeline_body, #timeline #timeline_body_for_update { border-top: none }\
    #timeline tbody > tr:last-child td { border-bottom: none }\
    #timeline { border-bottom: 1px dashed #D2DADA }\
    #timeline tr.last-read { background: #ffffe8 }\
    #timeline tr.aready-read { color: #555 }\
    #timeline tr.aready-read a { color: #444 !important; }\
    #timeline tr.aready-read td.content strong a { text-decoration: none }\
    #timeline tr.aready-read td.thumb img { opacity: .6 }\
    #timeline tr.hentry_hover.last-read:hover { background: #ffc }\
    #pagination-message { font-style:italic; text-align:right; margin:1em 0 !important; }\
    #pagination-message + div.bottom_nav { margin-top: 0 !important; }\
    #timeline td.thumb img { width:48px; height:48px; }\
    a.googlemap { display: block; margin-top: 4px; }\
    ")
}

// *** sorting of friends (sidebar) *** //

var friends = xpath2array(select('#side #friends > span.vcard', null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE))

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

var address = find(null, '#side .vcard span.adr')

if (address && /[+-]?\d+\.\d+,[+-]?\d+\.\d+/.test(address.textContent)) {
  var API_KEY = 'ABQIAAAAfOaovFhDnVE3QsBZj_YthxSnhvsz13Tv4UkZBHR3eJwOymtuUxT045UEYNAo1HL_pePrMexH4SYngg',
      coordinates = RegExp['$&']
  // create static map that links to Google Maps
  address.innerHTML = '<a class="googlemap" href="http://maps.google.com/maps?q=' + coordinates + '"><img src="http://maps.google.com/staticmap?center=' + coordinates + '&markers=' + coordinates + ',red&zoom=13&size=165x165&key=' + API_KEY + '" alt=""></a>'
}

// *** update notification *** //

var wrapper = find(null, '#content > div.wrapper')

if (wrapper && typeof GM_xmlhttpRequest == "function") {
  var scriptURL = 'http://userscripts.org/scripts/show/24398',
      sourceURL = scriptURL.replace(/show\/(\d+)$/, 'source/$1.user.js'),
      scriptLength = 20277,
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
      #userscript_update { text-align: right; color: gray }\
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

function up(node, type) {
  do {
    node = node.parentNode
  } while (node && node.nodeName.toLowerCase() != type)
  return node
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
  var xpath = object.constructor == XPathResult
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
    
    if (params.headers) for (name in params.headers)
      req.setRequestHeader(name, params.headers[name])
    
    req.open(params.method, params.url, true)
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
