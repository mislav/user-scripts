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
    jQuery = realWindow.jQuery,
    twttr = realWindow.twttr,
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
      
      log('checking for new tweets (%s)', url)
      loadJSON(url, function(updates) {
        log('found %s new tweets', updates.length)
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
      }, { onerror: function(xhr){ log('error while updating timeline') } })
      
      updateTimestamps()
    }
    
    var pollInterval = null
    
    var startPolling = function() {
      pollInterval = setInterval(checkUpdates, (debug ? 12 : 120) * 1000)
    }
    
    if (polling) startPolling()
    
    var target = $('rssfeed')
    if (target) {
      var label = $E('label', {id: 'auto_update', title: 'updates your timeline every 2 minutes'})
      var pollToggle = $E('input', { type: 'checkbox' })
      pollToggle.checked = polling
      label.appendChild(pollToggle)
      label.appendChild(document.createTextNode(' auto-update'))
      target.appendChild(label)

      pollToggle.addEventListener('change', function(e) {
        log('polling: %s', pollToggle.checked)
        if (pollToggle.checked) {
          if (!pollInterval) {
            checkUpdates()
            startPolling()
          }
        } else {
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
        }
        setValue('polling', (polling = pollToggle.checked))
      }, false)
    }
  } // if home
      
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
} else if (singleTweetPage) {
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

//= toolkit/update_notifier.js

var scriptURL = 'http://userscripts.org/scripts/show/24398',
    sidebar = $('side'),
    wrapper = find(null, '#content > .wrapper')
    
if (sidebar) {
  var scriptInfo = $E('div', { id: 'endless_tweets' }, 'with ')
  scriptInfo.appendChild($E('a', { 'href': scriptURL }, 'Endless Tweets'))
  scriptInfo.appendChild(document.createTextNode(' v' + scriptVersion))
  var section = $('rssfeed') || find(sidebar, '.section')
  section.appendChild(scriptInfo)
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
})

//= toolkit/toolkit.js

function twitterLinkify(text) {
  return linkify(text).replace(/(^|\W)@(\w+)/g, '$1@<a href="/$2">$2</a>')
}

function reveal(element) {
  jQuery(element).hide().slideDown()
}

//= endless_tweets.sass

// get a reference to the jQuery object, even if it requires
// breaking out of the GreaseMonkey sandbox in Firefox
// (we need to trust Twitter.com)
})(typeof jQuery == "undefined" ? unsafeWindow : window)
