var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.use(sinonChai)

var Cache = require('../index.js');

var config = {
  defaultCacheConfig: {
    cache:  {
      max: 50
    }
  }
};


var fakeData = [
  { id: 0 },
  { id: 1 }
];

function apiGET (options) {
  if (options && options.id) {
    if (options.id < 10) {
      return Promise.resolve({
        id: options.id
      });
    } else {
      return Promise.reject(options.id);
    }
  }

  return Promise.resolve(fakeData);
}

function formatResponse(object) {
  return {
    objects: object,
  }
}

function stub(){ 
  return Promise.resolve(0);
}

describe('Cache', function() {
  describe('setup', function() {
    it('takes rules', function() {
      var rule = function(){};

      var cache = new Cache({
        rules: {
          rule: rule,
        }
      });

      expect(cache.rules.rule).to.equal(rule);
    });

    it('takes a default config', function() {
      var cache = new Cache(config);
      expect(cache.defaultCacheConfig).to.equal(config.defaultCacheConfig);
    });

    it('takes datatypes', function() {
      var dataTypes = {};

      var cache = new Cache({
        dataTypes: dataTypes
      });

      expect(cache.dataTypes).to.equal(dataTypes);
    });
  });

  describe('getting', function() {
    it('uses function name as a default key', function(done) {
      var cache = new Cache(config);

      cache.get(apiGET, [], {
        format: formatResponse
      }).then(function() {
        expect(cache.requestCache.apiGET).to.not.be.undefined;
        done();
      }, function(e) {
        console.log(e.stack);
      });
    });

    it('throws if no function name or key is supplied', function(done) {
      var cache = new Cache(config);
      var fn = function(){};

      cache.get(fn).then(function() {
        expect.fail();
        done();
      }, function(e) {
        expect(e).to.contain('No key was passed in');
        done();
      });
    });

    it('uses default config if none is supplied', function(done) {
      var cache = new Cache(config);

      sinon.stub(Cache.prototype, 'setCaches');

      cache.get(apiGET).then(function() {
        expect(Cache.prototype.setCaches.args[0]).to.include(config.defaultCacheConfig);
        Cache.prototype.setCaches.restore();
        done();
      }, function(e) {
        console.log(e.stack)
      });
    });

    it('loads from cache on rule success', function(done) {
      var stub = sinon.stub(Cache.prototype, 'loadFromCache');

      var cache = new Cache({
        rules: {
          success: function() {
            return true;
          }
        },
        defaultCacheConfig: {
          cache: { max: 50 }
        }
      });

      cache.get(apiGET, [], {
        format: formatResponse,
        config: {
          rules: [cache.rules.success]
        }
      }).then(function() {
        expect(Cache.prototype.loadFromCache).to.have.been.called.once;
        stub.restore();
        done();
      }, function(e) {
        stub.restore();
        console.log(e.stack);
      });
    });

    it('does not load from cache on rule failure', function(done) {
      var defaultConfig = {
        cache: { max: 50 }
      };

      var stub = sinon.stub(Cache.prototype, 'loadFromCache');

      var cache = new Cache({
        rules: {
          success: function() {
            return false;
          }
        },
        config: defaultConfig,
      });

      cache.get(apiGET, [], {
        format: formatResponse,
        config: {
          rules: [cache.rules.success]
        }
      }).then(function() {
        expect(Cache.prototype.loadFromCache).to.not.have.been.called.once;
        stub.restore();
        done();
      }, function(e) {
        console.log(e.stack);
        stub.restore();
      })
    });

    it('loads from a populated cache', function(done) {
      var cache = new Cache(config);

      cache.get(apiGET, [], {
        format: formatResponse
      }).then(function() {
        cache.getById('objects', 0, apiGET, [{ id: 0 }]).then(function(o) {
          expect(o).to.equal(fakeData[0]);
          done();
        });
      }, function(e) {
        console.log(e.stack);
      });
    });
  });
});
