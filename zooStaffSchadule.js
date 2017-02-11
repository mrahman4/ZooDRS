
var https = require('https');           
var AWS = require("aws-sdk");  

var DRS_URL                 = "api.amazon.com";    
var DRS_PATH                = "/auth/o2/token";  

//var code = "" ; 

var productsTable = "zooProducts";
var docClient = new AWS.DynamoDB.DocumentClient(); 


var redirect_uri    = "https://xxxxxx.us-east-1.amazonaws.com/prod/zooStaffSchadule";


exports.handler = (event, context, callback) => {
    // TODO implement
    
    
    console.info("event = " + JSON.stringify(event));
    console.info("context = " + JSON.stringify(context));
    
    //console.info("event.queryStringParameters.code = " + JSON.stringify(event.queryStringParameters.code));
    
    if(event.queryStringParameters && event.queryStringParameters.code  )
    {
        var code , productName ;
        
        if (event.queryStringParameters.code.value)
            code = event.queryStringParameters.code.value;
        else
            code = event.queryStringParameters.code;
        
        if (event.queryStringParameters.product.value)
            productName = event.queryStringParameters.product.value;
        else
            productName = event.queryStringParameters.product;
        
        
        console.info("code found = " + code);
        console.info("productName found = " + productName);
    
        getProductInfo( productName , 
            function(product)
            {
                console.info("getProductInfo inside callback");
                console.info("product:", JSON.stringify(product));
                
                getRefreshToken(code , product , context , 
                    function (refresh_token , access_token)
                    {
                        console.info("getAccessToken sucess.  refresh_token = " + refresh_token);
                        product.everyPeriod = 0 ;
                        product.refreshToken = refresh_token ;
                        product.accessToken = access_token ;
                        updateRefreshToken( product , 
                            function()
                            {
                                context.succeed();
                            }
                        );
                    }
                );        
            }
        );
        
    }
    else
    {
        purchaseNewItem( event, context, callback ); 
    }
    
};


function getProductInfo( productName , callback)
{
    var prodcut =""; 
    
    var params = { 
        TableName: productsTable,
        Key: {
            "productName": productName
        },
        ProjectionExpression: "productName,accessToken,clientID,clientSecret,everyPeriod,purchaseDate,refreshToken,replenishPath"
    };

    console.log("Before get Product Info... " + productName ); 
     
    docClient.get(params, function(err, data) {
        console.log("inside get Product Info to read product info");
        
        if (err)
        {
            console.log("Get Product Info from DB error: " + JSON.stringify(err));
        } 
        else
        {
            console.info("Get Product Info from DB succeeded:", JSON.stringify(data, null, 2));
            if(data.Item ) {
                prodcut = data.Item ;
            } 
        }
        console.info("product:", JSON.stringify(prodcut));
        callback(prodcut);
    });
    
    console.log("getProductInfo");
}

function purchaseNewItem( event, context, callback )
{
    console.log("purchaseNewItem");
    
    readSchadule( 
        function ( productsArray )
        {
            var productNumber = 0 ;
            console.log("readRefreshToken Done");
            
            productsArray.forEach (
                function(product) {
                    productNumber++;
                    
                    console.log( productNumber + " - product" + JSON.stringify(product) );
                    
                    getAccessTokenFromRefreshToken( product , context, 
                        function (refresh_token , access_token)
                        {
                            console.log("getAccessTokenFromRefreshToken Done");
                            
                            product.refreshToken    = refresh_token ; 
                            product.accessToken     = access_token  ;
                            
                            updateRefreshToken( product , 
                                function()
                                {
                                    dashReplenish( product , 
                                        function()
                                        {
                                            context.succeed();                
                                        }
                                    );        
                                }
                            );
                            
                        }
                    );
                                            
                                
                    
                    
                }
            );
        }            
    );                
}

function readRefreshToken( product , callback)
{
    console.info("readRefreshToken");
    
    var tokenValue = "" ;
    
    var params = {
        TableName: tokenTable,
        Key: {
            "tokenType": product.productName
        },
        ProjectionExpression: "tokenValue"
    };
    
    try
    {
        docClient.get(params, function(err, data) {
            
            if (err)
            {
                console.error("Unable to read token value. Error JSON:", JSON.stringify(err, null, 2));
            } 
            else
            {
                console.info("Get  token value from DB succeeded:", JSON.stringify(data, null, 2));
                if(data.Item ) {
                    tokenValue = data.Item.tokenValue ;
                }
                console.info( "tokenValue = " + tokenValue );
            }
            
            callback(tokenValue);        
        });
    }
    catch (err1)
    {
       console.error("read token value. Error JSON:", JSON.stringify(err1, null, 2)); 
    }
}

function getAccessTokenFromRefreshToken(product , context, callback)
{
    console.info("getAccessTokenFromRefreshToken old_refresh_token = " + product.refreshToken);
    
    getAccessToken(product , context, 
        function (new_refresh_token , new_access_token)
        {
            console.info("getAccessToken sucess.  new_access_token = " + new_access_token );
            console.info("new_refresh_token = " + new_refresh_token );
            
            callback(new_refresh_token , new_access_token);
        }
        
    );
}

function getRefreshToken(code, product , context, callback)
{
    var output = "";
    
    var para = "grant_type=authorization_code&code="+ encodeURIComponent(code) +"&client_id="+encodeURIComponent(product.clientID)+"&client_secret="+encodeURIComponent(product.clientSecret)+ "&redirect_uri="+encodeURIComponent(redirect_uri);
    console.info("para = " + para );
    
    var options = {
        host: DRS_URL,
        port: 443,
        path: DRS_PATH,
        method: 'POST',
        agent: false,
        headers: 
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': para.length
        }
    };

    try
    {
        var req = https.request(options, 
                    function(res) {
                        console.log('STATUS: ' + res.statusCode);
                        console.log('HEADERS: ' + JSON.stringify(res.headers));
                        res.setEncoding('utf8');
                        
                        var access_token = output[access_token] ;
                        var refresh_token = output[refresh_token] ;
                        var responseString = '';
                        
                        res.on('data', function (chunk) {
                            console.log('BODY: ' + chunk);
                            responseString += chunk; 
                        });
                        
                        res.on('end', function() {
                            console.log("responseString = "+ responseString);
                            
                            output = JSON.parse(responseString);
                            access_token = output.access_token ;
                            refresh_token = output.refresh_token ;
                            
                            console.log("output = " + output);
                            console.log("access_token = " + access_token);
                            console.log("refresh_token = " + refresh_token);
                            
                            callback(refresh_token , access_token);
                        });
                        
                        
                    });
        req.on('error', context.fail);
        req.write(para);
        req.end();
        
    }
    catch(e)
    {
        console.log("Error:" +e);
    }
}

function getAccessToken(product, context, callback)
{
    var output = "";
    
    var para = "grant_type=refresh_token&refresh_token="+ encodeURIComponent(product.refreshToken) +"&client_id="+encodeURIComponent(product.clientID)+"&client_secret="+encodeURIComponent(product.clientSecret)+ "&redirect_uri="+encodeURIComponent(redirect_uri);
    console.info("para = " + para );
    
    var options = {
        host: DRS_URL,
        port: 443,
        path: DRS_PATH,
        method: 'POST',
        agent: false,
        headers: 
        {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': para.length
        }
    };

    try
    {
        var req = https.request(options, 
                    function(res) {
                        console.log('STATUS: ' + res.statusCode);
                        console.log('HEADERS: ' + JSON.stringify(res.headers));
                        res.setEncoding('utf8');
                        
                        var access_token = output[access_token] ;
                        var refresh_token = output[refresh_token] ;
                        var responseString = '';
                        
                        res.on('data', function (chunk) {
                            console.log('BODY: ' + chunk);
                            responseString += chunk; 
                        });
                        
                        res.on('end', function() {
                            console.log("responseString = "+ responseString);
                            
                            output = JSON.parse(responseString);
                            access_token = output.access_token ;
                            refresh_token = output.refresh_token ;
                            
                            console.log("output = " + output);
                            console.log("access_token = " + access_token);
                            console.log("refresh_token = " + refresh_token);
                            
                            callback(refresh_token , access_token);
                        });
                        
                        
                    });
        req.on('error', context.fail);
        req.write(para);
        req.end();
        
    }
    catch(e)
    {
        console.log("Error:" +e);
    }
}


function updateRefreshToken( product , callback )
{
    var date ; 
    
    getNewDate( product.everyPeriod,
        function (newDate) 
        {
            date = newDate ;
        }
    );
    
    console.log("product", JSON.stringify(product));
    
    var params = {
        TableName: productsTable,
        Key:{
            "productName": product.productName
        },
        UpdateExpression: "set refreshToken = :refresh, accessToken = :access, purchaseDate=:date",
        ExpressionAttributeValues:{
            ":refresh"  : product.refreshToken,
            ":access"   : product.accessToken,
            ":date"     : date   
        },
        ReturnValues:"UPDATED_NEW"
    };
    
    console.log("Updating refresh_token ..." + product.productName );
    
    docClient.update(params, function(err, data) {
        if (err)
        {
            console.log("Unable to update refresh_token. Error JSON:", JSON.stringify(err, null, 2));
        } 
        else
        {
            console.info("Update refresh_token succeeded:", JSON.stringify(data, null, 2));
        }
        
        callback();        
    });
    
    
}



function dashReplenish(  product , callback )
{
    console.info("dashReplenish " );
    
    var para = "" ;
    
    var options = { 
        host: 'dash-replenishment-service-na.amazon.com', 
        port: 443, 
        path: product.replenishPath , 
        method: 'POST',
        agent: false,
        headers: {
                    'Authorization' : 'Bearer ' + product.accessToken , 
                    'x-amzn-accept-type': 'com.amazon.dash.replenishment.DrsReplenishResult@1.0', 
                    'x-amzn-type-version': 'com.amazon.dash.replenishment.DrsReplenishInput@1.0'
        } 
    };
    
    
    
    var req = https.request(options, (res) => {
        console.log('statusCode:', res.statusCode); 
        console.log('headers:', res.headers); 
        res.on('data', (d) => {
            process.stdout.write(d); 
        }); 
    }); 

    req.on('error', (e) => {
        console.log("we have a error");
        console.error(e); 
    }); 

    req.end();
    
}


function readSchadule( callback )
{
    console.log("readSchadule" );
    
    var productsArray = [] ;
    var todatDate ;
    
    getTodayDate(
        function(date)
        {
            todatDate = date ;
        }
    ); 
    
    var params = {
        TableName               : productsTable,
        ProjectionExpression    : "productName, purchaseDate, refreshToken, accessToken , clientID, clientSecret, replenishPath, everyPeriod",
        FilterExpression        : "purchaseDate = :date",
        
        ExpressionAttributeValues: {
                ":date": todatDate 
        }
    };
    
    console.error("param = " , params);
    
    docClient.scan(params, function(err, data) {
        if (err)
        {
            console.error("Unable to read Schadule. Error JSON:", JSON.stringify(err, null, 2));
        } 
        else
        {
            console.log("Get  Schadule from DB succeeded:", JSON.stringify(data, null, 2));
            
            /*data.Items.forEach (
                    function(i) {
                        productsArray.push( i.foodName );
                    }
            );*/
            
            productsArray = data.Items ;
            console.log( "productsArray = " + JSON.stringify(productsArray) );
        }
        
        callback( productsArray );
        
    });
    
}

function getNewDate(everyPeriod ,  callback)
{
    console.log("everyPeriod = " + everyPeriod);
    
    var day = new Date().getDate() + everyPeriod;
    var month = new Date().getMonth() ;  
    var year = new Date().getFullYear() ;  
    
    console.log("year = " + year);
    console.log("month = " + month);
    console.log("day = " + day);
    
    if (day > 28)
    { 
        day -= 28 ;
        month++;
        
        if (month > 11 )
        {
                month = 1;
                year++;
        }
    }
    
    if (month === 0)
        month = 1 ;
    
    console.log("year = " + year);
    console.log("month = " + month);
    console.log("day = " + day);
    
    
    //var newDateString = new Date(year, month, day, 0, 0, 0, 0).toISOString().substr(0, 10);
    var newDateString = year + "-" + month + "-" + day ;
    
    console.log("newDateString = " + newDateString);
    
    callback( newDateString );
}
function getTodayDate(callback)
{
    /*
    new Date().toISOString()
    > '2012-11-04T14:51:06.157Z'

    new Date().toISOString().
    replace(/T/, ' ').      // replace T with a space
    replace(/\..+/, '')     // delete the dot and everything after
    > '2012-11-04 14:55:45'
    */
    //var currdatetime = new Date();
    //var currdatetime = new Date().toISOString().
    
    var currdatetime = new Date().toISOString().substr(0, 10);
    
    console.log("currdatetime = " + currdatetime);
    
    /*
    getNewDate( 6 ,  
        function (newdate)
        {
            console.log("newdate = " + newdate);
        }
    );*/
    
    
    
    callback( currdatetime );
}
