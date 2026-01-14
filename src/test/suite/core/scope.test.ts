import * as assert from 'assert';

import { getScopeLocation, getScopeModeLabel, normalizeDocRightScope } from '../../../core/scope';

suite('scope', () => {
  test('normalize defaults to full', () => {
    const scope = normalizeDocRightScope(null);
    assert.strictEqual(scope.mode, 'full');
    assert.strictEqual(scope.selection, null);
    assert.strictEqual(scope.locked, false);
    assert.strictEqual(scope.markerId, null);
    assert.strictEqual(getScopeModeLabel(scope), 'unlocked');
    assert.strictEqual(getScopeLocation(scope), 'No scope locked (editing enabled).');
  });

  test('normalize range with valid selection', () => {
    const scope = normalizeDocRightScope({
      mode: 'range',
      selection: {
        anchorKey: 'a',
        anchorOffset: 1,
        anchorType: 'text',
        focusKey: 'b',
        focusOffset: 2,
        focusType: 'text',
        isBackward: true
      },
      markerId: 'marker-1'
    });

    assert.strictEqual(scope.mode, 'range');
    assert.ok(scope.selection);
    assert.strictEqual(scope.locked, true);
    assert.strictEqual(scope.markerId, 'marker-1');
    assert.strictEqual(getScopeModeLabel(scope), 'selection');
    assert.strictEqual(getScopeLocation(scope), 'User-selected range in the document.');
  });

  test('normalize range falls back when selection is invalid', () => {
    const scope = normalizeDocRightScope({
      mode: 'range',
      selection: { anchorOffset: 1 }
    });

    assert.strictEqual(scope.mode, 'full');
    assert.strictEqual(scope.selection, null);
    assert.strictEqual(scope.locked, false);
    assert.strictEqual(scope.markerId, null);
  });
});
