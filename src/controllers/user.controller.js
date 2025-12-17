import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/apiResponse.js"
import fs from "fs"

const registerUser = asyncHandler(async (req,res)=>{
    // get user details from frontend
    const {email,username,fullname,password} = req.body
    // validation
    if([fullname,email,password,username].some((field)=>field?.trim()==="")){
        throw new ApiError(400,"All fields are required !!")
    }
    // check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    } 

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required !!");
    }
    // check if user already exists
    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })

    if(existedUser){
        fs.unlinkSync(avatarLocalPath);
        fs.unlinkSync(coverImageLocalPath);
        throw new ApiError(409,"User already registered !!")
    }
    // upload images to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400,"Coudn't upload avatar to Cloud !!");
    }
    // create user object - create entry in db
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    // remove password and refresh token field
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    // check for user creation
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering !!")
    }
    // return response
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User Registered Successfully !!")
    );
})

export {registerUser}