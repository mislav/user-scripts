var checkUserscriptUpdate = (function(){
  // return a no-op function if this is not Greasemonkey
  // (in other browsers we don't have cross-domain permissions)
  if (typeof GM_xmlhttpRequest != "function") return (function() {})
  
  var update = {
    get available() { return getValue('updateAvailable', false) },
    set available(value) { setValue('updateAvailable', value) },
    get scriptLength() { return getValue('scriptLength') },
    set scriptLength(value) { setValue('scriptLength', value) },
    get checkedAt() { return getValue('updateTimestamp') },
    set checkedAt(value) { setValue('updateTimestamp', value) },
    interval: 172800 // 2 days
  }
  
  function validateScriptLength(length, scriptLength) {
    update.available = scriptLength != length
  }
  
  return function(scriptURL, scriptLength, callback) {
    if (!scriptLength) return // we're probably in development mode
  
    // detect user has updated script
    if (update.scriptLength != scriptLength) {
      update.available = false
      update.scriptLength = scriptLength
    }
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
