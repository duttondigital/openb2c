# Ticketing system composition: internal issue tracking like Jira/Linear
let
  lib = import <nixpkgs/lib>;
  composeLib = import ../../schema/lib/compose.nix { inherit lib; };

  modules = lib.evalModules {
    modules = [
      ../../schema/base.nix
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
  tables = modules.config.tables;
  operations = composeLib.processOperations modules.config.operations;
}
