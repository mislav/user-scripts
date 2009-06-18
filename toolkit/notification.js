var Notification = (function() {
  var fluid = window.fluid && typeof window.fluid.showGrowlNotification == "function",
      prism = window.platform && typeof window.platform.showNotification == "function",
      supported = fluid || prism,
      queue = []
  
  if (!supported) {
    var show = function() {}
  } else if (fluid) {
    var show = window.fluid.showGrowlNotification
  } else {
    var show = function(params) {
      window.platform.showNotification(params.title, params.description, params.icon)
    }
  }
  
  return {
    supported: supported,
    show: show,
    enqueue: function(params) {
      if (!supported) return
      queue.push(params)
    },
    release: function() {
      if (!supported) return
      var limit = queue.length - 4
      for (var i = queue.length - 1; i >= 0; i--) {
        if (i < limit) {
          Notification.show({
            title: '(' + limit + ' more update' + (limit > 1 ? 's' : '') + ')',
            description: '',
            onclick: function() { if (fluid) window.fluid.activate() }
          })
          break
        }
        Notification.show(queue[i])
      }
      queue = []
    }
  }
})()
