$(document).ready(function() {
    ko.bindingHandlers.doNotBind = {
        init: function() {
            return {
                controlsDescendantBindings: true
            };
        }
    };
    ko.virtualElements.allowedBindings.doNotBind = true;
    
    var socket = io();

    function Factory(f) {
        var self = this;

        self.id = f._id;
        self.name = ko.observable(f.name);
        self.min = ko.observable(f.min);
        self.max = ko.observable(f.max);
        self.expanded = ko.observable(true);
        self.nodes = ko.observableArray(f.nodes);
        self.displayName = ko.computed(function() {
            return self.name() + ': (' + self.min() + '-' + self.max() + ')';
        });

        self.editModal = {
            title: ko.observable('Edit factory'),
            name: ko.observable(),
            min: ko.observable(),
            max: ko.observable()
        };

        self.generateModal = {
            num: ko.observable()
        };

        self.toggle = function() {
            self.expanded(!self.expanded());
        };
        
        self.rightclick = function(data, event) {
            var contextMenu = $('#factoryContextMenu');
            ko.cleanNode(contextMenu.get(0));

            contextMenu
                .unbind()
                .show()
                .css({
                    position: 'absolute',
                    left: event.pageX,
                    top: event.pageY
                });

            ko.applyBindings(data, contextMenu.get(0));
            
            $(document).click(function(event) {
                contextMenu.hide();
            });
        };
        
        self.acquireLock = function(callback) {
            socket.emit('lock', self.id, function(success) {
                callback(success);
            });
        };

        self.edit = function() {
            self.acquireLock(function(success) {
                if(success) {
                    var editModal = $('#editModal');
                    ko.cleanNode(editModal.get(0));
                    editModal.unbind().modal('show');
                    ko.applyBindings(self, editModal.get(0));
                    
                    self.editModal.name(self.name());
                    self.editModal.min(self.min());
                    self.editModal.max(self.max());
                    
                    $('#editForm').validator().on('submit', function(e) {
                        if(!e.isDefaultPrevented()) {
                            self.save();
                        }
                        e.preventDefault();
                    });
                } else {
                    $('#lockAlert').modal('show');
                }
            });
        };

        self.save = function() {
            socket.emit('updateFactory', self.id, self.editModal.name(), self.editModal.min(), self.editModal.max(), function(err) {
               if(err) {
                   alert(err);
               } else {
                    self.name(self.editModal.name());
                    self.min(self.editModal.min());
                    self.max(self.editModal.max());
                    self.closeEdit();
               }
            });
        };

        self.closeEdit = function() {
            socket.emit('unlock', self.id);
            $('#editModal').modal('hide');
        };

        self.deleteFactory = function() {
            self.acquireLock(function(success) {
                if(success) {
                    var deleteModal = $('#deleteModal');
                    ko.cleanNode(deleteModal.get(0));
                    deleteModal.unbind().modal('show');
                    ko.applyBindings(self, deleteModal.get(0));
                } else {
                    $('#lockAlert').modal('show');
                }
            });
        };

        self.confirmDelete = function() {
            socket.emit('deleteFactory', self.id, function(err) {
                if(err) {
                    alert(err);
                } else {
                    self.closeDelete(true);
                }
            });
        };

        self.closeDelete = function(deleted) {
            if(!deleted) {
                socket.emit('unlock', self.id);
            }
            $('#deleteModal').modal('hide');
        };

        self.showGenerate = function() {
            self.acquireLock(function(success) {
                if(success) {
                    var generateModal = $('#generateModal');
                    ko.cleanNode(generateModal.get(0));
                    generateModal.unbind().modal('show');
                    ko.applyBindings(self, generateModal.get(0));
                    self.generateModal.num('');
                    $('#generatorForm').validator().on('submit', function(e) {
                        if(!e.isDefaultPrevented()) {
                            self.generate();
                        }
                        e.preventDefault();
                    });
                } else {
                    $('#lockAlert').modal('show');
                }
            });
            
            return false;
        };

        self.generate = function() {
            socket.emit('generateNodes', self.id, self.generateModal.num(), self.min(), self.max(), function(err, newNodes) {
               if(err) {
                   alert(err);
               } else {
                   self.nodes(newNodes);
                   self.closeGenerate();
               }
            });
        };

        self.closeGenerate = function() {
            socket.emit('unlock', self.id);
            $('#generateModal').modal('hide');
        };
    }

    function ViewModel() {
        var self = this;

        self.currentFactory = ko.observable();
        self.factories = ko.observableArray();
        self.addFactory = function(factory) {
            self.factories.push(factory);
        };
        self.expanded = ko.observable(true);
        self.toggle = function() {
            self.expanded(!self.expanded());
        };

        self.editModal = {
            title: ko.observable('Create factory'),
            name: ko.observable(),
            min: ko.observable(),
            max: ko.observable()
        };

        self.create = function() {
            var editModal = $('#editModal');
            ko.cleanNode(editModal.get(0));
            editModal.unbind().modal('show');
            ko.applyBindings(self, editModal.get(0));

            self.editModal.name('');
            self.editModal.min('');
            self.editModal.max('');
            
            $('#editForm').validator().on('submit', function(e) {
                if(!e.isDefaultPrevented()) {
                    self.save();
                }
                e.preventDefault();
            });
        };

        self.save = function() {
            socket.emit('createFactory', self.editModal.name(), self.editModal.min(), self.editModal.max(), function(err, record) {
                if(err) {
                    alert(err);
                } else {
                    self.addFactory(new Factory(record));
                    self.closeEdit();
                }
            });
        };

        self.closeEdit = function() {
            $('#editModal').modal('hide');
        };

        self.rightclick = function(data, event) {
            var contextMenu = $('#rootContextMenu');
            ko.cleanNode(contextMenu.get(0));

            contextMenu
                .unbind()
                .show()
                .css({
                    position: 'absolute',
                    left: event.pageX,
                    top: event.pageY
                });

            ko.applyBindings(data, contextMenu.get(0));

            $(document).click(function(event) {
                contextMenu.hide();
            });
        };
        
        socket.on('new factory', function(record) {
            self.addFactory(new Factory(record));
        });
        
        socket.on('factory deleted', function(id) {
            self.factories.remove(function(item) {
                return item.id == id;
            });
        });
        
        socket.on('factory updated', function(record) {
            var factory = ko.utils.arrayFirst(self.factories(), function(item) {
                return item.id == record._id;
            });
            
            factory.name(record.name);
            factory.min(record.min);
            factory.max(record.max);
            factory.nodes(record.nodes);
        });

        socket.emit('retrieveAll', function(err, records) {
            if(err) {
                alert(err);
            } else {
                records.forEach(function(record) {
                    self.addFactory(new Factory(record));
                });
            }
        });
        
        self.closeAlert = function() {
            $('#lockAlert').modal('hide');
        };
    }


    ko.applyBindings(new ViewModel());
});