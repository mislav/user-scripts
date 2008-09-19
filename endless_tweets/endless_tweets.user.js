// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @exclude        http://twitter.com/help
// @exclude        http://twitter.com/help/*
// ==/UserScript==

var timeline  = $('timeline'),
    home      = window.location.pathname == '/home',
    debugMode = GM_getValue('debugMode', false),
    quotably  = GM_getValue('quotablyIntegration', true)
    
if (home) {
  var lastReadTweet = GM_getValue('lastReadTweet', 0)
  var oldLastRead   = lastReadTweet
}

GM_registerMenuCommand('Endless Tweets debug mode', function() {
  GM_setValue('debugMode', (debugMode = !debugMode))
  alert('debug mode ' + (debugMode ? 'ON' : 'OFF'))
})

GM_registerMenuCommand('turn ' + (quotably ? 'off' : 'on') + ' Twitter Quotably.com integration', function() {
  GM_setValue('quotablyIntegration', (quotably = !quotably))
  alert('Quotably integration ' + (quotably ? 'ON' : 'OFF'))
})

if (timeline) {
  var nextPageLink = find('content', "div.pagination a[@rel='prev']"),
      timelineBody = timeline.tBodies[0],
      enablePreloading = true,
      loading = false,
      preloadingHandler = null
      
  var someTweetLink = find(timelineBody, '> tr[1] div.status-body a')
  if (someTweetLink) {
    var pageDelimiterColor = getStyle(someTweetLink, 'color')
    var pageDelimiterStyle = '1px dotted ' + pageDelimiterColor
  } else {
    var pageDelimiterColor = '#aaa'
    var pageDelimiterStyle = '1px solid ' + pageDelimiterColor
  }
  
  if (quotably) {
    quotablyIcon = "data:image/gif,GIF89a%0F%00%0D%00%A57%002u%D93v%D98v%D96z%DF%3Cy%DA7%7B%DF7%7C%E1%3D%81%DFU%7B%DA%3C%82%DFr%80%DAZ%9A%EE%8E%93%DC%89%99%DE%82%9C%E1%A4%A4%A4%A5%A5%A5%A8%A8%A8%BB%9E%DE%AB%AB%AB%B0%B0%B0%B1%B1%B1%B3%B3%B3%B4%B4%B4%B7%B7%B7%B9%B9%B9p%D0%FAq%D2%FA%91%CD%F9%BF%C2%E9%AC%C7%F0%C5%C5%C5%A3%D5%F8%9D%D7%FB%DE%C6%E4%CE%CE%CE%D1%D1%D1%D9%D9%D9%E8%E8%E8%C7%F1%FD%E9%E9%E9%EB%EB%EB%ED%ED%ED%F2%F2%F2%DB%F9%FE%DB%FA%FE%F7%F7%F7%F8%F8%F8%FB%F9%F9%FB%FB%FB%FC%FC%FC%FD%FC%FB%FD%FD%FD%FE%FE%FE%FF%FE%FE%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%FF%2C%00%00%00%00%0F%00%0D%00%00%06Z%C0%92pH%2C%96n%C8%A42)L%D6F%24'%F4%D6%BC%B9%2C%95%14%F2%9A%A5%1Ei%95%CA%0B%09%16%23%9B%9F%87)%99F1%8F%93G%2C%19%97%BDo%90%C7%83%E2%CE%EF%DDM%11z%0F%157%82z%85M%18%83%177%8Bz%8DM%2B%19%10%15*7%93%95%97UK%9DF%9FCA%00%3B"
    
    function addQuotably(el) {
      if (el.nodeName.toLowerCase() == 'tr') {
        // timeline tweet
        var status_id = el.id.split('_')[1]
        var meta = find(el, 'td.content span.meta')
        var statusLink = selectString('a[1]/@href', meta)
        var actions = $('status_actions_' + status_id)
      } else {
        log("adding Quotably link for person's last update")
        var lastEntry = find(el, '> .wrapper > .hfeed > .hentry')
        var statusLink = selectString('.entry-meta a[1]/@href', lastEntry)
        var actions = find(lastEntry, '.status_actions')
      }
      var quot = document.createElement('a')
      quot.href = statusLink.replace(/twitter/, 'quotably')
      quot.className = 'quotably'
      quot.title = 'Follow the conversation'
      var img = document.createElement('img')
      img.alt = 'quotably'
      img.src = quotablyIcon
      quot.appendChild(img)
      // append it after the 'favorite' and 'reply' icons
      actions.appendChild(quot)
    }
    // the current update on person's profile
    if ($('profile')) addQuotably($('content'))
  }

  function stopPreloading(text) {
    enablePreloading = false
    window.removeEventListener('scroll', preloadingHandler, false)
    var message = $E('p', { id: 'pagination-message' }, text)
    timeline.parentNode.insertBefore(message, timeline.nextSibling)
  }

  function processTweet(row) {
    if (quotably) {
      try { addQuotably(row) }
      catch (e) { log('addQuotably() failed (%s)', e) }
    }
    
    var id = Number(row.id.split('_')[1])
    
    if (home) {
      if (id > lastReadTweet) {
        // a tweet newer than the last read? mark it as new last read
        GM_setValue('lastReadTweet', (lastReadTweet = id))
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
        GM_xmlhttpRequest({
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
            var newTimelineBody = table.tBodies[0]
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
    .status_actions .quotably img { margin-top: 0 }\
    #timeline { border-collapse: collapse }\
    #timeline td.content span.meta { white-space: nowrap }\
    #timeline td[align='right'] { padding-top:2px; padding-bottom:2px; }\
    #timeline tbody { border-top: " + pageDelimiterStyle + " }\
    #timeline tbody:first-child { border-top: none }\
    #timeline tbody > tr:last-child td { border-bottom: none }\
    #timeline { border-bottom: 1px dashed #D2DADA }\
    #timeline tr.last-read { background: #ffffe8 }\
    #timeline tr.aready-read { color: #666 }\
    #timeline tr.aready-read a { color: #555 !important; text-decoration: underline }\
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

if (wrapper) {
  var scriptURL = 'http://userscripts.org/scripts/show/24398',
      sourceURL = scriptURL.replace(/show\/(\d+)$/, 'source/$1.user.js'),
      scriptLength = 13802,
      updateAvailable = GM_getValue('updateAvailable', false)

  function validateScriptLength(length) {
    if (updateAvailable = scriptLength != length)
      GM_setValue('updateAvailable', length)
    else
      GM_setValue('updateAvailable', updateAvailable)
  }

  if (typeof updateAvailable == 'number') validateScriptLength(updateAvailable)

  if (!updateAvailable) {
    var lastUpdate = GM_getValue('updateTimestamp'),
        time = Math.floor(new Date().getTime() / 1000),
        performCheck = time > lastUpdate + 172800 // 2 days
        
    if (lastUpdate && performCheck) {
      GM_xmlhttpRequest({
        method: 'HEAD',
        url: sourceURL,
        headers: { 'Accept-Encoding': '' }, // no gzip
        onload: function(r) {
          var m = r.responseHeaders.match(/Content-Length: (\d+)/)
          validateScriptLength(Number(m[1]))
        }
      })
      log('Performed check for script updates')
    }
    
    if (!lastUpdate || performCheck)
      GM_setValue('updateTimestamp', time)
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
  if (!/^\.?\//.test(xpath)) xpath = css2xpath(xpath)
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
  if (!styleElement) {
    var head = document.getElementsByTagName('head')[0]
    if (!head) return
    var styleElement = $E('style', { type: 'text/css' })
    head.appendChild(styleElement)
  }
  styleElement.innerHTML += css
}

function log(message) {
  if (debugMode) {
    for (var i = 1; i < arguments.length; i++)
      message = message.replace('%s', arguments[i])
      
    GM_log(message)
  }
}
