function applyAnalytics($, gat, account) {
  var pageTracker = gat && gat._getTracker(account)
  
  if (pageTracker) {
    pageTracker._setDetectFlash(false)
  } else {
    $.segmentUser = $.trackPageview = $.trackEvent = $.trackClicks = function(){}
    return
  }
  
  $.segmentUser = function(seg) {
    try { pageTracker._setVar(seg) } catch(err) {}
  }
  $.trackPageview = function(path) {
    if (path) {
      var url = new URL(path)
      path = url.pathWithQuery()
      if (url.external()) path = '/' + url.host + path
    }
    try { pageTracker._trackPageview(path) } catch(err) {}
  }
  $.trackEvent = function(category, action, label, value) {
    try { pageTracker._trackEvent(category, action, label, value) } catch(err) {}
  }
  $.trackClicks = function(element, fn) {
    element.addEventListener('mousedown', function(e) {
      if (e.button == 0) {
        var url = null
        if (typeof fn == "function") url = fn.call(this, e)
        else if (fn) url = fn
        else if (element.href) url = element.href

        if (url) this.trackPageview(url)
      }
    }, false)
  }
  
  $.trackPageview()
}