# Duchy Opera composition: imports modules and evaluates schema
let
  lib = import <nixpkgs/lib>;
  composeLib = import ../../schema/lib/compose.nix { inherit lib; };

  modules = lib.evalModules {
    modules = [
      ../../schema/base.nix
      {
        organization = {
          name = "Duchy Opera";
          description = "Cornish charity opera company";
        };
      }
      ../../schema/modules/identity.nix
      ../../schema/modules/user.nix
      ../../schema/modules/user_b2c.nix  # Adds customer_type to user
      ../../schema/modules/api_key.nix
      ../../schema/modules/artist.nix
      ../../schema/modules/performance.nix
      ../../schema/modules/ticket.nix
      ../../schema/modules/transaction.nix
      ../../schema/modules/venue.nix
    ];
  };

in {
  organization = modules.config.organization;
  tables = modules.config.tables;
  operations = composeLib.processOperations modules.config.operations;
}
