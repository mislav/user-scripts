var polling = getValue('polling', false)

function updateTimestamps() {
  var now = new Date()
  
  forEach(select('.meta .published', $et.timeline), function(span) {
    var time, title = span.getAttribute('title')
    if (title) {
      time = new Date(title)
      span.innerHTML = Time.agoInWords(time, now) + ' ago'
    } else if (time = Time.agoToDate(span.textContent, now)) {
      span.setAttribute('title', time.toString())
    }
  })
}
updateTimestamps()

function deliverUpdate(data) {
  var update = buildUpdateFromJSON(data)
  
	// finally, insert the new tweet in the timeline ...
  insertTop(update, $et.timeline)
  // ... and remove the oldest tweet from the timeline
  removeChild(find($et.timeline, '> li[last()]'))
  
  // never send Growl notifications for own tweets
  if (Notification.supported && data.user.screen_name != $et.currentUser) {
    var title = data.user.screen_name + ' updated ' + strip(find(update, '.published').textContent),
        description = data.text.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    Notification.enqueue({
      title: title, description: description, icon: find(update, '.author img'),
      identifier: 'tw' + data.id, onclick: function() { window.fluid.activate() }
    })
  }
}

var debug = false // temp set to true for testing purposes

function checkUpdates() {
  var url = '/statuses/friends_timeline.json'
  url += debug ? '?count=2' : '?since_id=' + $et.lastRead
  
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
    Notification.release()
    
    if (count) {
      $et.setLastRead(data.id)
      livequeryRun()
      $et.trackEvent('timeline', 'polling', 'found updates for ' + $et.currentUser, count)
    }
  })
}

function checkUpdatesConditionally() {
  if (polling && 'home' == $et.page) checkUpdates()
}

var updateInterval = setInterval(function() {
  updateTimestamps()
  checkUpdatesConditionally()
}, (debug ? 12 : 120) * 1000)

var target = $('rssfeed')
if (target) {
  var label = $E('label', {id: 'auto_update', title: 'updates your timeline every 2 minutes'})
  var pollToggle = $E('input', { type: 'checkbox' })
  pollToggle.checked = polling
  label.appendChild(pollToggle)
  label.appendChild(document.createTextNode(' auto-update'))
  target.appendChild(label)

  pollToggle.addEventListener('change', function(e) {
    setValue('polling', (polling = pollToggle.checked))
    checkUpdatesConditionally()
    log('polling: %s', polling)
  }, false)
}