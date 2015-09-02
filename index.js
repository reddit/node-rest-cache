var crypto = require('crypto');
var LRU = require('lru-cache');

function Cache(config) {
  var config = config || {};

  this.rules = config.rules || {};

  this.defaultDataCacheConfig = config.defaultDataCacheConfig || {};
  this.defaultRequestCacheConfig = config.defaultRequestCacheConfig || {};
  this.dataTypes = config.dataTypes || {};

  this.requestCache = {};
  this.dataCache = {};

  this.setUpDataCache();
}

Cache.prototype.setUpDataCache = function() {
  for (var type in this.dataTypes) {
    this.resetData(type);
  }
}

Cache.prototype.get = function(fn, params, options) {
  var cache = this;
  var options = options || {};

  var config = options.config || this.defaultRequestCacheConfig;
  var key = options.name || fn.name;

  if (!key) {
    return Promise.reject('No key was passed in, and function did not have a name.');
  }

  var paramsHash = Cache.generateHash(params);

  var failedRule = false;

  if (config.rules) {
    failedRule = config.rules.some(function(rule) {
      return !rule(params);
    });
  }

  if (!failedRule) {
    var cachedData = this.loadFromCache(key, paramsHash, config);

    if (cachedData) {
      return Promise.resolve(cachedData);
    }
  }

  return new Promise(function(resolve, reject) {
    fn.apply(undefined, params).then(function(data){
      resolve(data);

      if (options.format) {
        data = format(data);
      }

      cache.setCaches(key, paramsHash, format(data), config);
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

      return Promise.resolve(o);
    }
  }

  return this.get(fn, params, options);
};


Cache.prototype.loadFromCache = function(key, hash, config) {
  if (!this.requestCache[key]) { return; }

  var requestCache = this.requestCache[key].get(hash);
  if(!requestCache) { return; }

  var obj = {};
  var dataCache;
  var found = true;
  var id;

  for (var type in requestCache) {
    dataCache = this.dataCache[type];
    if (!dataCache) { return; }

    id = this.getidProperty(type);

    if (requestCache[type].map) {
      obj[type] = requestCache[type].map(function(id) {
        var data = dataCache.get(id);
        if (!data) {
          found = false;
        }

        return data;
      });
    } else {
      obj[type] = dataCache.get(id);
      found = !!obj[type];
    }

    if (!found) { return; }
  }

  return obj;
};

Cache.prototype.setCaches = function(key, hash, data, config) {
  this.setRequestCache(key, hash, data, config);
  this.setDataCache(data);
};

Cache.prototype.setRequestCache = function(key, hash, data, config) {
  var dataType;
  var id;

  if (!this.requestCache[key]) {
    if (!config.cache) {
      throw('No LRU configuration passed in for '+key+', aborting.');
    }

    this.requestCache[key] = this.requestCache[key] || new LRU(config.cache);
  }

  var idCache = {};

  for (var type in data) {
    id = this.getidProperty(type);

    if (data[type].map) {
      idCache[type] = data[type].map(function(d) {
        return d[id];
      });
    } else {
      idCache[type] =  data[type][id];
    }
  }

  this.requestCache[key].set(hash, idCache);
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
        if (data[k][o][id]) {
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
    this.requestCache = {};
    return;
  }

  var cache = this.requestCache[key];

  if (!parameters) {
    cache.reset();
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

Cache.generateHash = function(params) {
  var shasum = crypto.createHash('sha1');
  shasum.update(JSON.stringify(params) || '');
  return shasum.digest('hex');
};

module.exports = Cache;
