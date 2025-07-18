const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    // host: 'localhost',
    // user: 'root',
    // password: '',
    // database: 'c237_supermarketdb'
    host: 'zxw6ws.h.filess.io',
    port: 3307,
    user: 'C328TravelWishList_jetbackbuy',
    password: '427766ceea97ead6c7975d85ac90ea584f82a776',
    database: 'C328TravelWishList_jetbackbuy'
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, contact, accounttype } = req.body;

    if (!username || !email || !password  || !contact || !accounttype) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Define routes
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/inventory', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM destination', (error, results) => {
      if (error) throw error;
      res.render('inventory', { destination: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, contact, accounttype } = req.body;

    const sql = 'INSERT INTO users (username, email, password, contact, accounttype) VALUES (?, ?, SHA1(?), ?, ?)';
    connection.query(sql, [username, email, password,  contact, accounttype], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/shopping');
            else
                res.redirect('/inventory');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/shopping', checkAuthenticated, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM destination', (error, results) => {
        if (error) throw error;
        res.render('shopping', { user: req.session.user, destination: results });
      });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const destinationId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM destination WHERE destinationId = ?', [destinationId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const destination = results[0];

            // Initialize cart in session if not exists
            if (!req.session.cart) {
                req.session.cart = [];
            }

            // Check if destination already in cart
            const existingItem = req.session.cart.find(item => item.destinationId === destinationId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    destinationId: destination.destinationId,
                    destinationName: destination.destinationName,
                    price: destination.price,
                    quantity: quantity,
                    image: destination.image
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("Destination not found");
        }
    });
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/destination/:id', checkAuthenticated, (req, res) => {
  // Extract the destination ID from the request parameters
  const destinationId = req.params.id;

  // Fetch data from MySQL based on the destination ID
  connection.query('SELECT * FROM destination WHERE destinationId = ?', [destinationId], (error, results) => {
      if (error) throw error;

      // Check if any destination with the given ID was found
      if (results.length > 0) {
          // Render HTML page with the destination data
          res.render('destination', { destination: results[0], user: req.session.user  });
      } else {
          // If no destination with the given ID was found, render a 404 page or handle it accordingly
          res.status(404).send('destination not found');
      }
  });
});

app.get('/addDestination', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addDestination', {user: req.session.user } ); 
});

app.get('/addCountry', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addCountry', {user: req.session.user } ); 
});

app.get('/addCity', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addCity', {user: req.session.user } ); 
});

app.post('/addDestination', upload.single('image'),  (req, res) => {
    // Extract destination data from the request body
    const { name, quantity, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }



    const sql = 'INSERT INTO destination (destinationName, quantity, price, image) VALUES (?, ?, ?, ?)';
    // Insert the new destination into the database
    connection.query(sql , [name, quantity, price, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding destination:", error);
            res.status(500).send('Error adding destination');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.post('/addDestination', upload.single('image'),  (req, res) => {
    // Extract destination data from the request body
    const { name, quantity, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }



    const sql = 'INSERT INTO destination (destinationName, quantity, price, image) VALUES (?, ?, ?, ?)';
    // Insert the new destination into the database
    connection.query(sql , [name, quantity, price, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding destination:", error);
            res.status(500).send('Error adding destination');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.post('/addDestination', upload.single('image'),  (req, res) => {
    // Extract destination data from the request body
    const { name, quantity, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }



    const sql = 'INSERT INTO destination (destinationName, quantity, price, image) VALUES (?, ?, ?, ?)';
    // Insert the new destination into the database
    connection.query(sql , [name, quantity, price, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding destination:", error);
            res.status(500).send('Error adding destination');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.get('/updateDestination/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const destinationId = req.params.id;
    const sql = 'SELECT * FROM destination WHERE destinationId = ?';

    // Fetch data from MySQL based on the destination ID
    connection.query(sql , [destinationId], (error, results) => {
        if (error) throw error;

        // Check if any destination with the given ID was found
        if (results.length > 0) {
            // Render HTML page with the destination data
            res.render('updateDestination', { destination: results[0] });
        } else {
            // If no destination with the given ID was found, render a 404 page or handle it accordingly
            res.status(404).send('Destination not found');
        }
    });
});

app.post('/updateDestination/:id', upload.single('image'), (req, res) => {
    const destinationId = req.params.id;
    // Extract destination data from the request body
    const { name, quantity, price } = req.body;
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE destination SET destinationName = ? , quantity = ?, price = ?, image =? WHERE destinationId = ?';
    // Insert the new destination into the database
    connection.query(sql, [name, quantity, price, image, destinationId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating destination:", error);
            res.status(500).send('Error updating destination');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

app.get('/deleteDestination/:id', (req, res) => {
    const destinationId = req.params.id;

    connection.query('DELETE FROM destination WHERE destinationId = ?', [destinationId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting destination:", error);
            res.status(500).send('Error deleting destination');
        } else {
            // Send a success response
            res.redirect('/inventory');
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
