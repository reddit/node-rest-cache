var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.use(sinonChai)

var Cache = require('../index.js');

function apiGET (options) {
  if (options.id) {
    if (options.id < 10) {
      return Promise.resolve({
        id: options.id
      });
    } else {
      return Promise.reject(options.id);
    }
  }

  return Promise.resolve([
    { id: 0 },
    { id: 1 }
  ]);
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
      var config = {};

      var cache = new Cache({
        defaultCacheConfig: config
      });

      expect(cache.defaultCacheConfig).to.equal(config);
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
      var cache = new Cache();
      cache.get(apiGET, {}, formatResponse).then(function() {
        expect(cache.requestCache.apiGET).to.exist;
        done();
      }, function(e) {
        console.log(e.stack);
      });
    });

    it('throws if no function name or key is supplied', function(done) {
      var cache = new Cache();
      cache.get(function(){}).then(function() {
        expect.fail();
        done();
      }, function(e) {
        expect(e).to.contain('No key was passed in');
        done();
      });
    });

    it('uses default config if none is supplied', function(done) {
      var defaultConfig = {};

      var cache = new Cache({
        defaultCacheConfig: defaultConfig
      });

      sinon.stub(Cache.prototype, 'setCaches');

      cache.get(stub).then(function() {
        expect(Cache.prototype.setCaches).to.have.been.calledWithMatch(defaultConfig);
        done();
      }, function(e) {
        console.log(e.stack)
      });
    });
  });
});
