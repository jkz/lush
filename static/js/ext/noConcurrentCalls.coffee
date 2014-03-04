executing = false
pending   = null

noConcurrentCalls = (func) ->
  (args...) ->
    dfd = do $.Deferred

    if executing
      pending = {func, args, dfd}
      return dfd

    executing = true

    dfd.then ->
      executing = false
      return unless pending
      {func, args, dfd} = pending
      pending = null
      noConcurrentCalls(func) args...
        .then dfd.resolve, dfd.reject

    func args...
      .always dfd.resolve

window.noConcurrentCalls = noConcurrentCalls
