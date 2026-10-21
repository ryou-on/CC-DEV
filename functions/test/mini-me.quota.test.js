const test = require('node:test');
const assert = require('node:assert');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'cc-dev-ps7';

const { __test__ } = require('../mini-me');

test('クォータ確認失敗時は有料プロバイダを呼ばない', async () => {
  let providerCalls = 0;

  await assert.rejects(
    __test__.runPaidOperation(
      async () => {
        throw Object.assign(new Error('quota unavailable'), { httpStatus: 503 });
      },
      async () => {
        providerCalls += 1;
        return { providerTaskId: 'must-not-run' };
      }
    ),
    (error) => error.httpStatus === 503
  );

  assert.strictEqual(providerCalls, 0);
});

test('クォータ確認成功後だけ有料プロバイダを1回呼ぶ', async () => {
  let providerCalls = 0;
  const result = await __test__.runPaidOperation(
    async () => undefined,
    async () => {
      providerCalls += 1;
      return { providerTaskId: 'ok' };
    }
  );

  assert.strictEqual(providerCalls, 1);
  assert.deepStrictEqual(result, { providerTaskId: 'ok' });
});
