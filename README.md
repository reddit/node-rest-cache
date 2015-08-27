# restcache
A caching solution for data fetching. Reduces the number of API calls you have
to make.

## What it is

This cache turns a request, such as `api.listings.get({ subreddit: 'funny '})`
into two caches:

* A cache of ids returned by that particular query
* A global cache of data objects

The intent is that you can now run `api.listings.get({ id: 1 })`, and if the
previous query had already populated a `listing` with id `1`, you get an
immediate response rather than making another server round-trip.

You can also reset specific instances of objects in the cache, for example, on
the event of a `patch` that edits an object.

## How it works

The constructor, `new Cache({ })`, takes settings:

* `rules`, a list of rules that operate on the parameters passed into an api request.
  Rules are functions that return booleans: if they return false, the cache
  is skipped (and does not invalidate the data cache.)
* `defaultCacheConfig`, the default config for all API calls if a config is not
  specified. The `cache` rules here also set the default request cache LRU
  settings. `defaultCacheConfig.cache` uses the same parameters as the
  [LRU](https://github.com/isaacs/node-lru-cache).
* `dataTypes` is an object that contains `key` - `config` pairs. The `config`
  optoinally contains `idProperty`, which defaults to `id` if not set (this
  is how the request IDs are mapped to the data IDs), and `cache`, which
  is the LRU cache config. (If not specified, uses the default as noted above.)

The primary function, `cache.get`, takes a series of arguments:

* A key by which to look up things in the cache. This can be ommitted if your
  function has a unique `name` (`function.name`)
* The function to be returned (should return a promise)
* Optionally, The arguments to be passed to the function
* Optionally, the cache configuration to be used (or else default configuration
  will be used. Provided config will *not* be merged with the default.
* Optionally, a response value formatting function to be returned pre-cache.
  This should return a flat object such as `{ datatype: data }` so that the
  cache can put data into the proper place. (This also means you can work with
  multiple data types at once.)

The cache will generate a key based on a sha1 of the JSON.stringified parameters.
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


Another function, `cache.reset`, allows you to reset a single object, a list of
objects, or to reset a cache entirely for a given data type. It takes the
arguments:

* Data type name
* Object or array to update

It will attempt to match the object (or, each object in the array), and replace
the objects in the cache with the supplied data. Or, if none was passed in, the
cache will be cleared for that data type.

## A Sample

```javascript
function loggedOut (params) {
  return !params.token;
}

var cache = new cache.get({
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

function formatListings(data) {
  return {
    listings: listings
  };
}

var apiParameters = { subreddit: 'funny' };

// Use `api.listings.get.name` as the key, and use the default config.
var listings = cache.get(api.listings.get, [apiParams], formatListings);

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
var listing = cache.get(
                key,
                api.listings.get,
                [apiParams],
                formatListings,
                editConfig
              );

listing.then(
  function(data) { /*...*/ },
  function(error) { /*...*/ }
);

// Reset an object in the cache that was updated
api.listings.patch(params).then(function(res) {
  cache.reset('listings', res.listing);
});

// Obliterate the cache
cache.reset('listings');
```

## Other Notes for Your Careful Consideration

* This assumes the global availability of `Promise`, provided by iojs, node
  harmony, and some ES6 transpilers such as babel.
