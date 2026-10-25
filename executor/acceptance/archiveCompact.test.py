"""Public lifecycle evidence is retained; wallet material remains forbidden."""
import gzip,json,pathlib,subprocess,tempfile,unittest

SCRIPT=pathlib.Path(__file__).with_name('archiveCompact.py')
class ArchiveLifecycleTests(unittest.TestCase):
 def test_jsonl_round_trip_and_wallet_guard(self):
  with tempfile.TemporaryDirectory(prefix='archive-lifecycle-') as root:
   root=pathlib.Path(root);source=root/'source';source.mkdir();public=source/'public';public.mkdir()
   trace=public/'job.log.lifecycle.jsonl';raw=b'{"event":"ready","elapsedMilliseconds":41717.12345}\n';trace.write_bytes(raw)
   out=root/'archive';result=subprocess.run(['python3',str(SCRIPT),'--base',str(source),'--out',str(out),'--select','public'],capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr);manifest=json.loads((out/'manifest.json').read_text());self.assertEqual(len(manifest['records']),1)
   self.assertEqual(gzip.decompress((out/manifest['records'][0]['file']).read_bytes()),raw)
   trace.write_text('{"privateKey":"fake-test-value"}\n');bad=root/'forbidden';result=subprocess.run(['python3',str(SCRIPT),'--base',str(source),'--out',str(bad),'--select','public'],capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0);self.assertFalse(bad.exists());self.assertIn('wallet material forbidden',result.stderr)
if __name__=='__main__':unittest.main()
