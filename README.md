# restcache
An LRU-based caching solution for rest-like data fetching. Reduces the number
of API calls you have to make.

## What it is

This cache turns a request, such as `api.listings.get({ subreddit: 'funny '})`
into two caches:

* A cache of ids returned by that particular query
* A global cache of data objects

The intent is that you can now run `api.listings.get({ id: 1 })`, and if the
previous query had already populated a `listing` with id `1`, you get an
immediate response rather than making another server round-trip.

## How it works

The primary function, `cache`, takes a series of arguments:

* A key by which to look up things in the cache. This can be ommitted if your
  function has a unique `name` (`function.name`)
* The function to be returned (should return a promise)
* Optionally, The arguments to be passed to the function
* Optionally, the cache configuration to be used (or else default configuration
  will be used. Provided config will *not* be merged with the default.
* Optionally, a response value formatting function to be returned pre-cache.
  This should return a flat object such as `{ datatype: data }` so that the
  cache can put data into the proper place.

The cache will generate a key based on a SHA of the JSON.stringified parameters.
It will then look up a list of IDs returned for that key+sha. If it does not
exist, it will return a Promise, and attempt to resolve the function passed in
with the parameters supplied. It will pass on a promise rejection, or if it is
successful, it will:

* Add an id, or a list of ids, to a request cache based on [key][sha]. This
  maintains a list of ids, *not* data objects, returned by requests.
* Add the returned data object to a global object cache based on the data type
  returned.
* Resolve the promise.

If the data is in the cache, it will:

* Use the ids to look up the objects in the global data cache. If they exist,
  they will be `Promise.resolve`d immediately. If not, the above process will
  be run, as we will assume the cache is stale.

## A Sample

```javascript
function loggedOut (params) {
  return !params.token;
}

var cache = new Cache({
  rules: {
    loggedOut: function(params) {
      return !params.token;
    },
    defaultCacheConfig: {
      cache: {
        max: 50, //50 items
        length: function(n) { return n.length }, //how length is determined
        dispose: function(key, n) { n.close() }, // optoinal handling on disposal
        maxAge: 1000 * 60 * 5, // 5 minutes
      },
      rules: [ loggedOut ]
    }
  },
  dataTypes:
    listings: {
      idProperty: '_id'
    }
  }
});

function responseFormat(data) {
  return {
    listings: listings
  };
}

var apiParameters = { subreddit: 'funny' };

// Use `api.listings.get.name` as the key, and use the default config.
var listings = cache(api.listings.get, [apiParams], formatRes);

listings.then(
  function(data) { /*...*/ },
  function(error) { /*...*/ }
);

// Use a custom key and config. Because it has a different key, it will force a
// cache refresh of the listing in question, even though it may already be in
// the listing cache.

var editConfig = {/*...*/};
var apiParameters = { _id: 1 };
var key = 'edit-listing-cache';
var listing = cache(key, api.listings.get, [apiParams], formatRes, editConfig);

listing.then(
  function(data) { /*...*/ },
  function(error) { /*...*/ }
);
```

## Other Notes for Your Careful Consideration

* This assumes the global availability of `Promise`, provided by iojs, node
  harmony, and some ES6 transpilers such as babel.
