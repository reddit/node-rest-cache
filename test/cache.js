var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.use(sinonChai)

var Cache = require('../index.js');

var config = {
  defaultRequestCacheConfig: {
    cache: {
      max: 2
    }
  },
  defaultDataCacheConfig: {
    cache: {
      max: 2
    }
  }
};

var fakeData = [
  { id: 0 },
  { id: 1 }
];

var headers = {
  'content-type': 'application/json',
};

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

  return Promise.resolve({
    body: fakeData,
    headers: headers,
  });
}

function apiGETOne (options) {
  return new Promise(function(resolve, reject) {
    apiGET(options).then(function(data) {
      resolve({
        body: data.body[0],
        headers: data.headers
      });
    });
  });
}

function formatResponse(object) {
  return {
    objects: object,
  }
}

function unformatResponse(object) {
  return object.objects;
}

function stub(){ 
  return Promise.resolve(0);
}

describe('Cache', function() {
  describe('setup', function() {
    it('takes a default config', function() {
      var cache = new Cache(config);
      expect(cache.defaultRequestCacheConfig).to.equal(config.defaultRequestCacheConfig);
    });

    it('takes datatypes', function() {
      var dataTypes = {};

      var cache = new Cache(Object.assign({
        dataTypes: dataTypes
      }, config));

      expect(cache.dataTypes).to.equal(dataTypes);
    });
  });

  describe('getting', function() {
    it('uses function name as a default key', function(done) {
      var cache = new Cache(config);

      cache.get(apiGET, [], {
        format: formatResponse
      }).then(function() {
        expect(cache.requestCache.get('apiGET')).to.not.be.undefined;
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
        expect(Cache.prototype.setCaches.args[0][3]).to.deep.equal(config.defaultRequestCacheConfig);
        Cache.prototype.setCaches.restore();
        done();
      }, function(e) {
        console.log(e.stack)
      });
    });

    it('loads from cache on rule success', function(done) {
      var stub = sinon.stub(Cache.prototype, 'loadFromCache');

      var cache = new Cache(config);

      cache.get(apiGET, [], {
        format: formatResponse,
        rules: [function() {
          return true;
        }],
        config: {
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
      var stub = sinon.stub(Cache.prototype, 'loadFromCache');

      var cache = new Cache(config);

      cache.get(apiGET, [], {
        format: formatResponse,
        rules: [function() {
          return false;
        }]
      }).then(function() {
        expect(Cache.prototype.loadFromCache).to.not.have.been.called.once;
        expect(cache.dataCache.objects).to.be.undefined;

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
      }).then(function(o) {
        cache.getById('objects', 0, apiGET, [{ id: 0 }], {
          format: formatResponse,
          unformat: unformatResponse
        }).then(function(o) {
          expect(o).to.equal(fakeData[0]);
          done();
        });
      }, function(e) {
        console.log(e.stack);
      });
    });

    it('loads from a populated cache from an endpoint returning one object', function(done) {
      var cache = new Cache(config);

      var spy = sinon.spy(function(){
        return apiGETOne.call(null, arguments);
      })

      cache.get(spy, [], {
        format: formatResponse,
      }).then(function(o) {
        cache.get(spy, [], {
          format: formatResponse,
          unformat: unformatResponse
        }).then(function(o) {
          expect(spy).to.have.been.called.once;
          expect(o.body).to.equal(fakeData[0]);
          done();
        });
      }, function(e) {
        console.log(e.stack);
      });

    });
  });

  describe('reset', function() {
    var cache;

    beforeEach(function() {
      cache = new Cache(config);

      return cache.get(apiGET, [], {
        format: formatResponse
      })
    });

    it('clears the entire data cache', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.resetData();
      expect(cache.dataCache.objects).to.be.undefined;
    });

    it('clears out a data type entirely', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.resetData('objects');
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.has(0)).to.be.false;
    });

    it('updates a single object in a type', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.resetData('objects', { id: 0, name: 'steve' });
      expect(cache.dataCache.objects.get(0).name).to.equal('steve');
    });

    it('updates an array of objects in a type', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.resetData('objects', [{ id: 0, name: 'steve' }]);
      expect(cache.dataCache.objects.get(0).name).to.equal('steve');
    });

    it('clears the entire request cache', function() {
      expect(cache.requestCache.get('apiGET')).to.not.be.undefined;
      cache.resetRequests();
      expect(cache.requestCache.get('apiGET')).to.be.undefined;
    });

    it('clears the cache for a given key', function() {
      expect(cache.requestCache.get('apiGET')).to.not.be.undefined;
      cache.resetRequests('apiGET');
      expect(cache.requestCache.get('apiGET').keys().length).to.equal(0);
    });

    it('clears the cache for a given key/parameter set', function() {
      expect(cache.requestCache.get('apiGET').get(Cache.generateHash([]))).to.not.be.undefined;
      cache.resetRequests('apiGET', []);
      expect(cache.requestCache.get('apiGET').get(Cache.generateHash([]))).to.be.undefined;
    });

    it('updates the ids for a given key/parameter set', function(done) {
      expect(cache.requestCache.get('apiGET')).to.not.be.undefined;
      cache.resetRequests('apiGET', [], { objects: [1] });

      cache.get(apiGET, [], {}).then(function(data) {
        expect(data.body.objects[0]).to.equal(fakeData[1]);
        done();
      });
    });
  });

  describe('delete', function() {
    var cache;

    beforeEach(function() {
      cache = new Cache(config);

      return cache.get(apiGET, [], {
        format: formatResponse
      })
    });

    it('deletes data from the data cache by id', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.deleteData('objects', 0);
      expect(cache.dataCache.objects.get(0)).to.be.undefined;
      expect(cache.dataCache.objects.get(1)).to.not.be.undefined;
    });

    it('deletes data from the data cache by object', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.deleteData('objects', fakeData[0]);
      expect(cache.dataCache.objects.get(0)).to.be.undefined;
      expect(cache.dataCache.objects.get(1)).to.not.be.undefined;
    });

    it('deletes data from the data cache by array of objects', function() {
      expect(cache.dataCache.objects).to.not.be.undefined;
      expect(cache.dataCache.objects.get(0)).to.equal(fakeData[0]);
      cache.deleteData('objects', fakeData);
      expect(cache.dataCache.objects.get(0)).to.be.undefined;
      expect(cache.dataCache.objects.get(1)).to.be.undefined;
    });
  });

  describe('header data', function() {
    var cache;


    beforeEach(function() {
      cache = new Cache(config);

      return cache.get(apiGET, [], {
        format: formatResponse
      })
    });

    it('can load header data', function() {
      expect(cache.head(apiGET.name, [])).to.equal(headers);
    });

    it('can load body data', function() {
      expect(cache.body(apiGET.name, []).objects).to.deep.equal(fakeData);
    });
  });
});
