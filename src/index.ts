import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Fono Backend is running!')
})

app.listen(port, () => {
  console.log(`Fono Backend listening on port ${port}`)
})
