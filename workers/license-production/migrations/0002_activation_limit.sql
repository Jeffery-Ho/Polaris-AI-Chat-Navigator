ALTER TABLE polaris_billing_activations ADD COLUMN browser TEXT;
ALTER TABLE polaris_billing_activations ADD COLUMN os TEXT;
CREATE INDEX IF NOT EXISTS polaris_billing_activations_license_status ON polaris_billing_activations(license_id, status);
-- Each license may hold 3 active installations. The check runs inside the write,
-- so concurrent redeem or claim requests cannot exceed the limit.
CREATE TRIGGER IF NOT EXISTS polaris_billing_activation_limit_insert
BEFORE INSERT ON polaris_billing_activations
WHEN NEW.status = 'active'
  AND (SELECT count(*) FROM polaris_billing_activations WHERE license_id = NEW.license_id AND status = 'active') >= 3
BEGIN
  SELECT RAISE(ABORT, 'activation_limit_reached');
END;
CREATE TRIGGER IF NOT EXISTS polaris_billing_activation_limit_reactivate
BEFORE UPDATE OF status ON polaris_billing_activations
WHEN NEW.status = 'active' AND OLD.status <> 'active'
  AND (SELECT count(*) FROM polaris_billing_activations WHERE license_id = NEW.license_id AND status = 'active') >= 3
BEGIN
  SELECT RAISE(ABORT, 'activation_limit_reached');
END;
