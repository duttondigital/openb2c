{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.issue = {
    id = { type = "integer"; pk = true; auto = true; };
    project_id = {
      type = "integer";
      required = true;
      references = "project(id)";
      relationship = {
        label = "Project";
      };
    };
    number = { type = "integer"; required = true; };  # Project-scoped issue number
    name = { type = "text"; required = true; };
    description = { type = "text"; };
    type = { type = "text"; default = "'task'"; };  # task, bug, feature, epic
    status = { type = "text"; default = "'todo'"; };  # todo, in_progress, in_review, done, cancelled
    priority = { type = "text"; default = "'medium'"; };  # low, medium, high, urgent
    creator_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      relationship = {
        label = "Creator";
      };
    };
    assignee_id = {
      type = "integer";
      references = "user(id)";
      relationship = {
        label = "Assignee";
      };
    };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
    updated_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  indexes.issue.by_project_status = {
    columns = [ "project_id" "status" ];
  };

  indexes.issue.by_assignee_status = {
    columns = [ "assignee_id" "status" ];
  };

  workflows.groups.issueWorkflow = {
    label = "Issue workflow";
    description = "Issue progress, review, completion, and escalation operations.";
    displayPriority = 40;
  };

  operations.issue = {
    read.relationships = [ "creator" "assignee" ];
    create.relationships = [ "creator" ];
    update.relationships = [ "creator" "assignee" ];

    start = {
      workflow = {
        group = "issueWorkflow";
        transitions = [{
          field = config.refs.issue.status;
          from = [ "todo" ];
          to = "in_progress";
        }];
        audit.summary = "Started issue";
      };
      guard = E.and
        (E.and
          (E.eq (E.f "status") (E.lit "todo"))
          (E.notNull (E.f "assignee_id")))
        (E.eq (E.rel "project" "status") (E.lit "active"));
      set = { status = "in_progress"; };
      effects = [
        { notify = { channel = "email"; template = "issue_started"; }; }
      ];
    };

    submit_for_review = {
      workflow = {
        group = "issueWorkflow";
        transitions = [{
          field = config.refs.issue.status;
          from = [ "in_progress" ];
          to = "in_review";
        }];
        audit.summary = "Submitted issue for review";
      };
      guard = E.eq (E.f "status") (E.lit "in_progress");
      set = { status = "in_review"; };
      effects = [
        { notify = { channel = "email"; template = "issue_review_requested"; }; }
      ];
    };

    complete = {
      workflow = {
        group = "issueWorkflow";
        transitions = [{
          field = config.refs.issue.status;
          from = [ "in_review" "in_progress" ];
          to = "done";
        }];
        audit.summary = "Completed issue";
      };
      guard = E.or
        (E.eq (E.f "status") (E.lit "in_review"))
        (E.eq (E.f "status") (E.lit "in_progress"));
      set = { status = "done"; };
      effects = [
        { emit = "issue.completed"; }
      ];
    };

    cancel = {
      workflow = {
        group = "issueWorkflow";
        transitions = [{
          field = config.refs.issue.status;
          from = [ "todo" "in_progress" "in_review" ];
          to = "cancelled";
        }];
        audit.summary = "Cancelled issue";
        confirmation = {
          required = true;
          title = "Cancel issue";
          message = "This will stop active work on the issue.";
          confirmLabel = "Cancel issue";
          severity = "warning";
        };
      };
      guard = E.and
        (E.ne (E.f "status") (E.lit "done"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { status = "cancelled"; };
    };

    reopen = {
      workflow = {
        group = "issueWorkflow";
        transitions = [{
          field = config.refs.issue.status;
          from = [ "done" "cancelled" ];
          to = "todo";
        }];
        audit.summary = "Reopened issue";
      };
      guard = E.or
        (E.eq (E.f "status") (E.lit "done"))
        (E.eq (E.f "status") (E.lit "cancelled"));
      set = { status = "todo"; };
    };

    assign = {
      relationships = [];
      policy = {
        label = "Assign issue";
        description = "Staff workflow operation for changing issue ownership.";
        audiences = [ "staff" ];
      };
      workflow = {
        group = "issueWorkflow";
        audit.summary = "Assigned issue";
      };
      guard = E.and
        (E.ne (E.f "status") (E.lit "done"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { };  # assignee_id set via parameters
      effects = [
        { notify = { channel = "email"; template = "issue_assigned"; }; }
      ];
    };

    escalate = {
      relationships = [];
      policy = {
        label = "Escalate issue";
        audiences = [ "staff" ];
        risk = "high";
      };
      workflow = {
        group = "issueWorkflow";
        audit.summary = "Escalated issue";
        confirmation = {
          required = true;
          title = "Escalate issue";
          message = "This will mark the issue as urgent.";
          confirmLabel = "Escalate";
          severity = "warning";
        };
      };
      guard = E.and
        (E.ne (E.f "priority") (E.lit "urgent"))
        (E.ne (E.f "status") (E.lit "done"));
      set = { priority = "urgent"; };
      effects = [
        { notify = { channel = "email"; template = "issue_escalated"; }; }
      ];
    };
  };
}
