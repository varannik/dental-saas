-- Spoken answers to a pending proposal (V6): "yes", "no", a correction, or "undo" are recorded
-- as interpretations with the outcome "control" and the action in the reason.
ALTER TABLE voice.interpretations DROP CONSTRAINT interpretations_outcome_check;
ALTER TABLE voice.interpretations ADD CONSTRAINT interpretations_outcome_check
  CHECK (outcome IN ('intent', 'control', 'none', 'rejected', 'failed'));
