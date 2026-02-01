import {connect} from 'mongoose'

const connectDB = async (dbUri) => {
    try{
        const response = await connect(dbUri)
        console.log(`MongoDB connected: ${response.connection.host}`)
    }
    catch(error){
        console.error("Error connecting to the database ", error)
        process.exit(1)
    }
}
export default connectDB;