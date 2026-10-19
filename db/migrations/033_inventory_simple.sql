-- Slice 31 bis — simplified inventory model: « à abattre : oui / non ».
-- « non » is stored as ``preserver`` (a tree to preserve, art. 122). Idempotent.
ALTER TABLE tree_registry DROP CONSTRAINT IF EXISTS tree_registry_inventory_destination_check;
ALTER TABLE tree_registry ADD CONSTRAINT tree_registry_inventory_destination_check
    CHECK (inventory_destination IN ('abattre', 'preserver', 'avenir', 'reserve', 'semencier'));
