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