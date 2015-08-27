var crypto = require('crypto');
var LRU = require('lru-cache');

function Cache(config) {
  var config = config || {};

  this.rules = config.rules || {};
  this.defaultCacheConfig = config.defaultCacheConfig || {};
  this.dataTypes = config.dataTypes || {};

  this.requestCache = {};
  this.dataCache = {};

  this.setUpDataCache();
}

Cache.prototype.setUpDataCache = function() {
  for (var k in this.dataTypes) {
    var cacheConfig = this.dataTypes[k].cache || this.defaultCacheConfig.cache;
    this.dataCache[k] = new LRU(cacheConfig);
  }
}

Cache.prototype.get = function(key, fn, params, format, config) {
  var cache = this;

  return new Promise(function(resolve, reject) {
    // Shift all the parameters if no key was passed in;
    if (typeof key === 'function') {
      config = format;
      format = params || Cache.returnData;
      params = fn;
      fn = key;
      key = fn.name;
    }

    if (!key) {
      throw('No key was passed in, and function did not have a name.');
    }

    var apply = typeof params === 'Array' ? 'apply' : 'call';

    var shasum = crypto.createHash('sha1');
    shasum.update(JSON.stringify(params));
    var paramsHash = shasum.digest('hex');

    fn[apply](undefined, params).then(function(data){
      cache.setCaches(key, paramsHash, format(data));
      resolve(data);
    }, function(error) {
      reject(error);
    });
  });
};

Cache.prototype.setCaches = function(key, hash, data) {
  this.setRequestCache(key, hash, data);
  this.setDataCache(data);
}

Cache.prototype.setRequestCache = function(key, hash, data) {
  var dataType;
  var id;

  this.requestCache[key] = this.requestCache[key] || {};
  this.requestCache[key][hash] = this.requestCache[hash] || {};

  for (var type in data) {
    dataType = this.dataTypes[type];
    id = dataType ? dataType.idProperty || 'id' : 'id';

    this.requestCache[key][hash][type] = data[type].map(function(d) {
      return d[id];
    });
  }
}

Cache.prototype.setDataCache = function(data) {
}

Cache.returnData = function(d) {
  return d;
}

module.exports = Cache;
