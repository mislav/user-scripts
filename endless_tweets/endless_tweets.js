// ==UserScript==
// @name           Endless Tweets
// @namespace      http://mislav.caboo.se/
// @description    Loads older tweets endlessly when you scroll on Twitter
// @include        http://twitter.com/*
// @include        https://twitter.com/*
// ==/UserScript==

(function(realWindow){

//= toolkit/gm_functions.js
//= toolkit/time.js

var jQuery = realWindow.jQuery,
    twttr = realWindow.twttr

function livequeryRun() {
  jQuery.livequery && jQuery.livequery.run()
}

var $et = {
  getTimeline: function() { return(this.timeline = $('timeline')) },
  getPage: function() { return(this.page = document.body.id) },
  getUpdateForm: function() { return(this.updateForm = find(null, 'form.status-update-form')) },
  inspectPage: function() { this.getTimeline(); this.getPage(); this.getUpdateForm() },
  sidebar: $('side'),
  
  currentUser: selectString('meta[@name="session-user-screen_name"]/@content'),
  lastRead: Number(getValue('lastReadTweet', 0)),
  setLastRead: function(id) { setValue('lastReadTweet', (this.lastRead = id).toString()) },
  debug: getValue('debugMode', false),
  sourceString: 'endlesstweets',
  version: '0.9.9',
  scriptSize: 0,
  
  getSessionCookie: function() {
    return (document.cookie.toString().match(/_twitter_sess=[^\s;]+/) || [])[0]
  }
}

//= toolkit/analytics.js
applyAnalytics($et, realWindow._gat, "UA-87067-6")

$et.inspectPage()

// have "from Endless Tweets" appear when users post updates
var statusUpdateSource = find($et.updateForm, '#source')
if (statusUpdateSource) statusUpdateSource.value = $et.sourceString

function log(message) {
  if ($et.debug) {
    for (var i = 1; i < arguments.length; i++)
      message = message.replace('%s', arguments[i])
      
    if (typeof GM_log == "function") GM_log(message)
    else if (window.console) console.log(message)
  }
}

if (typeof GM_registerMenuCommand == "function") {
  GM_registerMenuCommand('Endless Tweets debug mode', function() {
    setValue('debugMode', (debugMode = !debugMode))
    alert('debug mode ' + (debugMode ? 'ON' : 'OFF'))
  })
}

if ($et.timeline) {
  var enablePreloading = true,
      loading = false
      
  function stopPreloading(text) {
    enablePreloading = false
    var message = $E('p', { id: 'pagination-message' }, text)
    insertAfter(message, $et.timeline)
  }
  
  function clearPaginationMessage() {
    var message = $('pagination-message')
    if (message) removeChild(message)
  }
  
  var oldLastRead = $et.lastRead
  
  function processTweet(item) {
    var id = Number(item.id.split('_')[1])
    
    if ('home' == $et.page) {
      if (id > $et.lastRead) {
        // a tweet newer than the last read? mark it as new last read
        $et.setLastRead(id)
      } else if (id == oldLastRead) {
        stopPreloading("You have reached the last read tweet.")
        addClassName(item, 'last-read')
      } else if (id < oldLastRead && !enablePreloading) {
        addClassName(item, 'aready-read')
      }
    }
  }
  function processTimeline() {
    forEach(select('> li', $et.timeline), processTweet)
  }
  processTimeline()

  function nearingBottom() {
    var viewportBottom = window.scrollY + window.innerHeight,
        nearNextPageLink = document.body.clientHeight - window.innerHeight/3
    return viewportBottom >= nearNextPageLink
  }
  
  // core functionality of Endless Tweets: global handler that will
  // simulate a click to the "more" link when approaching bottom
  window.addEventListener('scroll', function(e) {
    if (enablePreloading && !loading && nearingBottom()) {
      var moreButton = jQuery('#pagination a[rel=next]')
      if (moreButton.length) {
        var matches = moreButton.attr('href').match(/\bpage=(\d+)/)
        loading = matches[0]
        var pageNumber = Number(matches[1])
        log('nearing the end of page; loading page %s', pageNumber)
        
        // simulate click by manually invoking cached event handlers
        // (jQuery's trigger functionality doesn't work in Greasemonkey sandbox)
        var handlers = moreButton.data('events')['click']
        for (guid in handlers) handlers[guid].call(moreButton.get(0))
      }
    }
  }, false)
  
  //= polling.js
  
  var dynamicPages = ['/home', '/replies', '/inbox', '/favorites', '/search.html'],
      pageSwitched = function() {
        enablePreloading = true
        clearPaginationMessage()
        $et.inspectPage()
      }
  
  // listen to jQuery ajax request to do extra processing after they are done
  jQuery($et.sidebar).bind('ajaxSuccess', function(e, xhr, ajax){
    var url = new URL(ajax.url)
  
    if (ajax.url.indexOf(loading) > -1) {
      loading = false
    } else if (dynamicPages.indexOf(url.path) != -1) {
      $et.trackPageview(url)
      // it's hard to detect searches with DOMNodeInserted below, so do it here
      if (url.path == '/search.html') pageSwitched()
    }
  })
  
  find('container', '.columns').addEventListener('DOMNodeInserted', function(event) {
    var element = event.target
    if (element.nodeType != 1) return
    
    if ('timeline' == element.id) {
      // defer the next step to allow for window.location and body.id to update
      setTimeout(function(){
        pageSwitched()
        if ('home' == $et.page) processTimeline()
      }, 10)
    } else if ('home' == $et.page && $et.timeline == element.parentNode) {
      processTweet(element)
    } else if ('following' == element.parentNode.id) {
      sortFriends()
    }
  }, false)
} else if ('show' == $et.page) {
  //= inline_reply.js
}

var content = $('content')
if (content) {
  // catch click to "in reply to ..." links
  content.addEventListener('click', function(e) {
    var link = up(e.target, 'a', this)
    if (link && /^\s*in reply to /.test(link.textContent)) {
      var statusID = link.href.match(/(\d+)$/)[1],
          statusUrl = '/statuses/show/' + statusID + '.json',
          fallback = function(xhr) { window.location = link.href }
          
      twttr.loading()
      loadJSON(statusUrl, function(response, xhr) {
        if (xhr.status >= 400) { fallback(xhr); return }
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
          $et.trackEvent('timeline', 'in_reply_to', 'loaded status ' + statusID)
        })
      }, { onerror: fallback })
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
      $et.trackEvent('layout', 'mini')
    }
  }
  else if (miniMode) {
    removeClassName(document.body, 'mini')
    miniMode = false
    $et.trackEvent('layout', 'restore')
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
      },
      own = preparedData.username == $et.currentUser

    prepareContainer()
    updateContainer.innerHTML = updateHTML.replace(/[A-Z][A-Z0-9_]+/g, function(key) {
      return preparedData[key.toLowerCase()] || key
    })
    var update = updateContainer.firstChild
    
    // remove excess elements
    if (!data.user.protected) removeChild(find(update, '.status-body > img'))
    if (!data.in_reply_to_status_id) removeChild(find(update, '.meta > a[last()]'))
    removeChild(find(update, '.actions a.' + (own ? 'reply' : 'del')))
    
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

// *** iPhone location map *** //

var address = find($et.sidebar, '.vcard .adr')

if (address && /[+-]?\d+\.\d+,[+-]?\d+\.\d+/.test(address.textContent)) {
  var API_KEY = 'ABQIAAAAfOaovFhDnVE3QsBZj_YthxSnhvsz13Tv4UkZBHR3eJwOymtuUxT045UEYNAo1HL_pePrMexH4SYngg',
      coordinates = RegExp['$&']
  // create static map that links to Google Maps
  address.innerHTML = '<a class="googlemap" target="_blank" href="http://maps.google.com/maps?q=' + coordinates + '"><img src="http://maps.google.com/staticmap?center=' + coordinates + '&markers=' + coordinates + ',red&zoom=13&size=165x165&key=' + API_KEY + '" alt=""></a>'
  
  $et.trackClicks(down(address), window.location + '/map')
}

//= toolkit/update_notifier.js

var scriptURL = 'http://userscripts.org/scripts/show/24398',
    wrapper = find(null, '#content > .wrapper')
    
if ($et.sidebar) {
  var scriptInfo = $E('div', { id: 'endless_tweets', 'class': 'section' }, 'with '),
      scriptLink = $E('a', { href: scriptURL, target: '_blank' }, 'Endless Tweets')
  scriptInfo.appendChild(scriptLink)
  scriptInfo.appendChild(document.createTextNode(' v' + $et.version))
  $et.sidebar.appendChild(scriptInfo)
  $et.trackClicks(scriptLink, '/endless-tweets/sidebar-link')
}

if (wrapper) checkUserscriptUpdate(scriptURL, $et.scriptSize, function() {
  var notice = $E('span', { id: 'userscript_update' },
    '“Endless Tweets” user script has updates (you have v' + scriptVersion + '). ')
  var install = $E('a', { 'href': scriptURL }, 'Get the upgrade')
  notice.appendChild(install)
  
  var topAlert = find('content', '.bulletin.info')
  if (!topAlert && 'home' == $et.page) topAlert = insertTop($E('div', { 'class': 'bulletin info' }), find(wrapper, '.section'))
  if (topAlert) topAlert.appendChild(notice)
  else insertTop(notice, wrapper)
  $et.trackClicks(install, '/endless-tweets/update-link')
})

//= toolkit/toolkit.js
//= toolkit/notification.js

function twitterLinkify(text) {
  return linkify(text, true).
    replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
    // TODO: active hashtags `isSearchLink("processHashtagLink")`
    // replace(/(^|\W)#(\w+)/g, '$1<a href="/search?q=%23$2" title="#$2" class="hashtag">#$2</a>')
}

function reveal(element) {
  jQuery(element).hide().slideDown()
}

//= endless_tweets.sass

// get a reference to the jQuery object, even if it requires
// breaking out of the GreaseMonkey sandbox in Firefox
// (we need to trust Twitter.com)
})(typeof jQuery == "undefined" ? unsafeWindow : window)
