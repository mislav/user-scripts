var friendNames = []

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

function completeName(textarea) {
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
    
    if (found.length == 0) return false
    
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
    
    return true
  }
}

function compare(a, b, filter) {
  if (filter) {
    a = filter(a); b = filter(b);
  }
  if (a == b) return 0;
  return a < b ? -1 : 1;
}

function sortFriends() {
  var friends = xpath2array(select('#following_list .vcard', sidebar, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE))

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
}
sortFriends()
