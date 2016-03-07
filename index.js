const sha = require('sha1');
const LRU = require('lru-cache');
const stableJSONStringify = require('json-stable-stringify');


const defaultCacheConfig = {
  max: 500,
  dispose: function(cache) {
    cache.reset();
  },
}

function Cache(config) {
  var config = config || {};

  this.defaultDataCacheConfig = config.defaultDataCacheConfig || defaultCacheConfig;
  this.defaultRequestCacheConfig = config.defaultRequestCacheConfig || defaultCacheConfig;
  this.dataTypes = config.dataTypes || {};

  this.dataCache = {};
  this.requestCache = new LRU(this.defaultRequestCacheConfig);
  this.headCache = new LRU(this.defaultRequestCacheConfig);

  this.setUpDataCache();
}

Cache.prototype.setUpDataCache = function() {
  for (var type in this.dataTypes) {
    this.resetData(type);
  }
}

Cache.prototype.get = function(fn, params, options) {
  var options = options || this.defaultRequestCacheConfig || {};

  if (!options || !options.key) {
    return fn.apply(undefined, params);
  }

  if (options.rules) {
    var failedRule = options.rules.some(function(rule) {
      return !rule(params);
    });

    if (failedRule) {
      return fn.apply(undefined, params);
    }
  }

  var cache = this;
  var key = options.name || fn.name;

  if (!options.cache && this.defaultRequestCacheConfig.cache) {
    options.cache = this.defaultRequestCacheConfig.cache;
  }

  var paramsHash = Cache.generateHash(params);

  var cachedData = this.loadFromCache(key, paramsHash);

  if (cachedData) {
    if (options.unformat) {
      cachedData.body = options.unformat(cachedData.body);
    }

    return Promise.resolve(cachedData);
  }

  return new Promise(function(resolve, reject) {
    fn.apply(undefined, params).then(function(data){
      var cacheData = Object.assign({}, data);
      resolve(data);

      if (options.format) {
        cacheData.body = options.format(cacheData.body);
      }

      cache.setCaches(key, paramsHash, cacheData, options);
    }, function(error) {
      reject(error);
    });
  });
};

Cache.prototype.getById = function(type, id, fn, params, options) {
  if (this.dataCache[type]) {
    var res = this.dataCache[type].get(id);

    if (res) {
      var o = {};
      o[type] = res;

      if (options.unformat) {
        o = options.unformat(o);
      }

      return Promise.resolve(o);
    }
  }

  var cache = this;

  return new Promise(function(resolve, reject) {
    cache.get(fn, params, options).then(function(d){
      resolve(d.body)
    }, reject);
  });
};


Cache.prototype.loadFromCache = function(key, hash) {
  if (!this.requestCache.get(key)) { return; }

  var requestCache = this.requestCache.get(key).get(hash);
  if(!requestCache) { return; }

  var headers = this.headCache.get(key).get(hash);

  if(typeof headers === 'undefined') { return; }

  var obj = {
    body: {},
    headers,
  };

  var dataCache;
  var found = true;
  var id;

  for (var type in requestCache) {
    dataCache = this.dataCache[type];
    if (!dataCache) { return; }

    id = this.getidProperty(type);

    if (requestCache[type].map) {
      obj.body[type] = requestCache[type].map(function(id) {
        var data = dataCache.get(id);
        if (typeof data === 'undefined') {
          found = false;
        }

        return data;
      });
    } else {
      obj.body[type] = dataCache.get(requestCache[type]);
      found = !!obj.body[type];
    }

    if (!found) { return; }
  }

  return obj;
};

Cache.prototype.setCaches = function(key, hash, data, options) {
  this.setRequestCache(key, hash, data, options);
  this.setDataCache(data.body);
};

Cache.prototype.setRequestCache = function(key, hash, data, options) {
  var dataType;
  var id;

  if (!this.requestCache.get(key)) {
    if (!options.cache) {
      throw('No LRU configuration passed in for '+key+', aborting.');
    }

    this.requestCache.set(key, new LRU(options.cache));
    this.headCache.set(key, new LRU(options.cache));
  }

  var idCache = {};

  // explicitly null, instead of undefined; this allows us to check if the key
  // exists
  data.headers = data.headers || null;
  this.headCache.get(key).set(hash, data.headers);

  for (var type in data.body) {
    id = this.getidProperty(type);

    if (data.body[type].map) {
      idCache[type] = data.body[type].map(function(d) {
        return d[id];
      });
    } else {
      idCache[type] = data.body[type][id];
    }
  }

  this.requestCache.get(key).set(hash, idCache);
};

Cache.prototype.setDataCache = function(data) {
  var dataType;
  var id;

  for (var k in data) {
    if (!this.dataCache[k]) {
      this.resetData(k);
    }

    dataType = this.dataTypes[k];

    id = this.getidProperty(k);

    if (Array.isArray(data[k])) {
      for (var o in data[k]) {
        if (data[k][o].hasOwnProperty(id) && this.dataCache[k]) {
          this.dataCache[k].set(data[k][o][id], data[k][o]);
        }
      }
    } else {
      this.dataCache[k].set(data[k][id], data[k]);
    }
  }
};

Cache.prototype.resetData = function(type, data) {
  if (!type) {
    this.dataCache = {};
    return;
  }

  var cache = this.dataCache[type];

  if (!cache) {
    var cacheConfig = this.getDataCacheConfig(type);

    if (cacheConfig) {
      this.dataCache[type] = new LRU(cacheConfig);
    }

    return;
  }


  if (!data) {
    cache.reset();
    return;
  }

  var id = this.getidProperty(type);

  // If it's an array
  if (Array.isArray(data)) {
    data.forEach(function(d) {
      cache.set(d[id], d);
    });
  } else {
    cache.set(data[id], data);
  }
};

Cache.prototype.resetRequests = function(key, parameters, ids) {
  if (typeof key === 'function') {
    key = key.name;
  }

  if (!key) {
    this.requestCache = new LRU(this.requestCacheConfig);
    this.headCache = new LRU(this.requestCacheConfig);
    return;
  }

  var cache = this.requestCache.get(key);
  var headCache = this.headCache.get(key);

  if (!cache || !headCache) {
    return;
  }

  if (!parameters) {
    cache.reset();
    headCache.reset();
    return;
  }

  var hash = Cache.generateHash(parameters);

  if (ids) {
    cache.set(hash, ids);
    return;
  }

  cache.del(hash);
};

Cache.prototype.deleteData = function(type, data) {
  if (!type || !this.dataCache[type]) {
    return;
  }

  var dataCache = this.dataCache[type];
  var id = this.getidProperty(type);

  if (Array.isArray(data)) {
    data.forEach(function(d) {
      dataCache.del(d[id]);
    });
    return;
  } else if (typeof data === 'object') {
    dataCache.del(data[id]);
    return;
  }

  dataCache.del(data);
}

Cache.prototype.getidProperty = function(type) {
  var dataType = this.dataTypes[type];
  return dataType ? dataType.idProperty || 'id' : 'id';
}

Cache.prototype.getDataCacheConfig = function(type) {
  if (this.dataTypes && this.dataTypes[type]) {
    if (this.dataTypes[type].hasOwnProperty('cache')) {
      return this.dataTypes[type].cache;
    }
  }

  return this.defaultDataCacheConfig.cache;
}

Cache.prototype.head = function(key, params) {
  var keyCache = this.headCache.get(key);
  if(!keyCache) { return; }

  var paramsHash = Cache.generateHash(params);

  return keyCache.get(paramsHash);
}

Cache.prototype.body = function(key, params) {
  var paramsHash = Cache.generateHash(params);
  return this.loadFromCache(key, paramsHash).body;
}

Cache.generateHash = function(params) {
  return sha(stableJSONStringify(params) || '');
};

module.exports = Cache;
