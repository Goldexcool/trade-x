import { connect } from './database/data-source.ts'
import { startJobs } from './jobs.ts'

await connect() // the api owns migrations
startJobs()
