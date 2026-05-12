# Ticketing system composition: internal issue tracking like Jira/Linear
let
  lib = import <nixpkgs/lib>;
  composeLib = import ../../schema/lib/compose.nix { inherit lib; };

  modules = lib.evalModules {
    modules = [
      ../../schema/base.nix
      {
        organization = {
          name = "OpenB2C";
          description = "OpenB2C framework examples";
        };
      }
      ../../schema/modules/identity.nix
      ../../schema/modules/user.nix
      ../../schema/modules/user_internal.nix  # Adds role, status to user
      ../../schema/modules/api_key.nix
      ../../schema/modules/project.nix
      ../../schema/modules/issue.nix
      ../../schema/modules/comment.nix
      ../../schema/modules/label.nix
    ];
  };

in {
  organization = modules.config.organization;
  auth = modules.config.auth;
  workflows = modules.config.workflows;
  tables = modules.config.tables;
  derived = modules.config.derived;
  indexes = modules.config.indexes;
  refs = modules.config.refs;
  relationships = modules.config.relationships;
  validations = modules.config.validations;
  operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
}
