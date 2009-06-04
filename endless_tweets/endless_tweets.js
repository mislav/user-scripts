// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @include        https://twitter.com/*
// ==/UserScript==

(function(realWindow){

//= toolkit/gm_functions.js

var timeline = $('timeline'),
    sidebar = $('side'),
    jQuery = realWindow.jQuery,
    twttr = realWindow.twttr,
    pageTracker = realWindow._gat && realWindow._gat._getTracker("UA-87067-6"),
    currentUser = selectString('meta[@name="session-user-screen_name"]/@content'),
    currentPage = document.body.id,
    debugMode = getValue('debugMode', false),
    home = 'home' == currentPage,
    singleTweetPage = 'show' == currentPage,
    sourceString = 'endlesstweets',
    scriptVersion = '0.9.6',
    scriptLength = 37585

function trackSegment(seg) {
  if (pageTracker) {
    try {
      pageTracker._setVar(seg)
    } catch(err) {}
  }
}
function trackPageview(url) {
  if (pageTracker) {
    if (url) url = url.replace(/^https?:\/\/[^\/]+/, '')
    try {
      pageTracker._trackPageview(url)
    } catch(err) {}
  }
}
trackPageview()

function trackClicks(element, fn) {
  element.addEventListener('mousedown', function(e) {
    if (e.button == 0) {
      if (typeof fn == "function") fn.call(this, e)
      else if (fn) trackPageview(fn)
      else if (element.href) trackPageview(element.href)
    }
  }, false)
}

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
    //= polling.js
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
          
          trackPageview(nextPageLink.href)

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
} else if (singleTweetPage) {
  //= inline_reply.js
}

var content = $('content')
if (content) {
  // catch click to "in reply to ..." links
  content.addEventListener('click', function(e) {
    var link = up(e.target, 'a', this)
    if (link && /^\s*in reply to /.test(link.textContent)) {
      var statusID = link.href.match(/(\d+)$/)[1],
          statusUrl = '/statuses/show/' + statusID + '.json'
      twttr.loading()
      loadJSON(statusUrl, function(response) {
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
          trackPageview(statusUrl)
        })
      })
      e.preventDefault()
    }
  }, false)
  
  // catch TAB keypresses in the update form
  content.addEventListener('keydown', function(e) {
    var textarea = null
    if (e.keyCode == 9 && (textarea = up(e.target, 'textarea', this))) {
      if (completeName(textarea)) e.preventDefault()
    }
  }, false)
}

var miniMode = false

function checkViewportWidth() {
  if (document.body.clientWidth < 780) {
    if (!miniMode) {
      addClassName(document.body, 'mini')
      miniMode = true
      trackSegment('mini layout')
    }
  }
  else if (miniMode) {
    removeClassName(document.body, 'mini')
    miniMode = false
    trackSegment('')
  }
}
window.addEventListener('resize', checkViewportWidth, false)
checkViewportWidth()

// *** JSON to HTML markup for a single update *** //

var buildUpdateFromJSON = (function() {
  var updateContainer,
      updateHTML = //= tweet.haml
  
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

    prepareContainer()
    updateContainer.innerHTML = updateHTML.replace(/[A-Z][A-Z0-9_]+/g, function(key) {
      return preparedData[key.toLowerCase()] || key
    })
    var update = updateContainer.firstChild
    
    if (!data.user.protected) removeChild(find(update, '.status-body > img'))
    if (!data.in_reply_to_status_id) removeChild(find(update, '.meta > a[last()]'))
    removeChild(find(update, '.actions a.' + (preparedData.username == currentUser ? 'reply' : 'del')))
    
    return update
  }
})()

function onAvatarLoad(data, callback) {
  var avatar = new Image()
  avatar.addEventListener('load', callback, false)
  avatar.src = data.user.profile_image_url
}

//= friends.js

var jQueryOldCookie = jQuery.cookie
jQuery.cookie = function(name, value, options) {
  if (value && name == "menus" && !(options && options.expires)) {
    if (!options) options = {}
    options.expires = 365
  }
  jQueryOldCookie(name, value, options)
}

jQuery(sidebar).bind("ajaxSuccess", function(e, xhr, ajax){
  if (ajax.url == "/timeline/render_following_avatars") sortFriends()
})

// *** iPhone location map *** //

var address = find(sidebar, '.vcard .adr')

if (address && /[+-]?\d+\.\d+,[+-]?\d+\.\d+/.test(address.textContent)) {
  var API_KEY = 'ABQIAAAAfOaovFhDnVE3QsBZj_YthxSnhvsz13Tv4UkZBHR3eJwOymtuUxT045UEYNAo1HL_pePrMexH4SYngg',
      coordinates = RegExp['$&']
  // create static map that links to Google Maps
  address.innerHTML = '<a class="googlemap" target="_blank" href="http://maps.google.com/maps?q=' + coordinates + '"><img src="http://maps.google.com/staticmap?center=' + coordinates + '&markers=' + coordinates + ',red&zoom=13&size=165x165&key=' + API_KEY + '" alt=""></a>'
  
  trackClicks(down(address), window.location + '/map')
}

//= toolkit/update_notifier.js

var scriptURL = 'http://userscripts.org/scripts/show/24398',
    wrapper = find(null, '#content > .wrapper')
    
if (sidebar) {
  var scriptInfo = $E('div', { id: 'endless_tweets' }, 'with '),
      scriptLink = $E('a', { href: scriptURL, target: '_blank' }, 'Endless Tweets')
  scriptInfo.appendChild(scriptLink)
  scriptInfo.appendChild(document.createTextNode(' v' + scriptVersion))
  var section = $('rssfeed') || find(sidebar, '.section')
  section.appendChild(scriptInfo)
  trackClicks(scriptLink, '/endless-tweets/sidebar-link')
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
  trackClicks(install, '/endless-tweets/update-link')
})

//= toolkit/toolkit.js

function twitterLinkify(text) {
  return linkify(text, true).replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
}

function reveal(element) {
  jQuery(element).hide().slideDown()
}

//= endless_tweets.sass

// get a reference to the jQuery object, even if it requires
// breaking out of the GreaseMonkey sandbox in Firefox
// (we need to trust Twitter.com)
})(typeof jQuery == "undefined" ? unsafeWindow : window)
