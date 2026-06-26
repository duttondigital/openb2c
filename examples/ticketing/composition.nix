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
        seed = {
          applyFixturesByDefault = true;
          fixtures = {
            user = [
              {
                id = 1;
                email = "mara@example.test";
                name = "Mara Evans";
                role = "admin";
                status = "active";
              }
              {
                id = 2;
                email = "kit@example.test";
                name = "Kit Morgan";
                role = "member";
                status = "active";
              }
            ];
            project = [
              {
                id = 1;
                key = "OPEN";
                name = "OpenB2C";
                description = "Framework delivery board.";
                owner_id = 1;
                status = "active";
              }
            ];
            issue = [
              {
                id = 1;
                project_id = 1;
                number = 1;
                name = "Harden generated checkout flow";
                description = "Verify generated ecommerce journeys with realistic browser fixtures.";
                type = "task";
                status = "todo";
                priority = "high";
                creator_id = 1;
                assignee_id = 2;
              }
            ];
            label = [
              {
                id = 1;
                project_id = 1;
                name = "frontend";
                color = "#111111";
                description = "User-facing generated UI work.";
              }
            ];
            comment = [
              {
                id = 1;
                issue_id = 1;
                author_id = 1;
                body = "Use generated fixtures to keep local examples reproducible.";
              }
            ];
          };
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
  audit = modules.config.audit;
  seed = modules.config.seed;
  integrations = modules.config.integrations;
  workflows = modules.config.workflows;
  tables = modules.config.tables;
  derived = modules.config.derived;
  indexes = modules.config.indexes;
  refs = modules.config.refs;
  relationships = modules.config.relationships;
  validations = modules.config.validations;
  operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
}
