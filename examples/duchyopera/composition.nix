# Duchy Opera composition: imports modules and evaluates schema
let
  lib = import <nixpkgs/lib>;
  composeLib = import ../../schema/lib/compose.nix { inherit lib; };

  modules = lib.evalModules {
    modules = [
      ../../schema/base.nix
      ../../schema/modules/api_key.nix
      ../../schema/modules/artist.nix
      ../../schema/modules/customer.nix
      ../../schema/modules/identity.nix
      ../../schema/modules/performance.nix
      ../../schema/modules/ticket.nix
      ../../schema/modules/transaction.nix
      ../../schema/modules/venue.nix
    ];
  };

in {
  tables = modules.config.tables;
  operations = composeLib.processOperations modules.config.operations;
}
