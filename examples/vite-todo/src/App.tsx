import { atom, createStore, useAtom } from "jotai";
import "./App.css";

const store = createStore();
const counter = atom(0);

store.set(counter, 1);

function App() {
  const [count, setCounter] = useAtom(counter);

  return (
    <>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCounter((x) => x + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </>
  );
}

export default App;
