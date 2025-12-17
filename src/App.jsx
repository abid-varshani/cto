import React, { useState, useEffect } from 'react'
import Spinner from './components/Spinner'
import sequenceText from './data/sequence.txt?raw'

function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (sequenceText) {
      const list = sequenceText.split('\n').map(s => s.trim()).filter(s => s.length > 0)
      setItems(list)
      setLoading(false)
    }
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <div className="App">
      <h1>Game Show Spinner</h1>
      {items.length > 0 && <Spinner items={items} />}
    </div>
  )
}

export default App
